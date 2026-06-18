import sys
import json
import os
import math
import ctypes
import openvsp_config
openvsp_config.LOAD_GRAPHICS = False
openvsp_config.LOAD_FACADE = True
import openvsp as vsp

if os.name == 'nt':
    try: ctypes.windll.kernel32.SetErrorMode(0x0002 | 0x8000)
    except: pass


def _clean(v):
    return 0.0 if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v


def run_vspaero(params):
    design_id   = params.get('designId', 'unknown')
    alpha_start = float(params.get('alphaStart', -2))
    alpha_end   = float(params.get('alphaEnd',   12))
    alpha_step  = float(params.get('alphaStep',   1))
    mach        = float(params.get('machNumber', 0.065))

    # Geometry reference values passed from createGeometry result
    wingspan      = float(params.get('wingspan', 0.0))
    wing_chord    = float(params.get('wingChord', 0.0))
    wing_tip      = float(params.get('wingTipChord', 0.0))
    wing_area     = float(params.get('wingArea', 0.0))

    # Fallback estimates from vsp3 filename / runDir if not provided
    if wing_area <= 0:
        wing_area = 0.25 * wingspan * (wing_chord + wing_tip) if wingspan > 0 else 0.3

    taper = wing_tip / wing_chord if wing_chord > 0 else 0.6
    if taper <= 0:
        taper = 0.6
    mac = (2.0 / 3.0) * wing_chord * (1.0 + taper + taper * taper) / (1.0 + taper) if wing_chord > 0 else 0.2

    if wingspan <= 0:
        wingspan = 1.5
    if mac <= 0:
        mac = 0.2
    if wing_area <= 0:
        wing_area = wingspan * mac

    # ── Resolve vsp3 file path ─────────────────────────────────────────
    # Prefer explicit vspFile from createGeometry output, then runDir, then cwd
    vsp_file = params.get('vspFile')
    if not vsp_file:
        run_dir  = params.get('runDir') or os.path.abspath(f"run_{design_id}")
        vsp_file = os.path.join(run_dir, f'{design_id}.vsp3')

    if not os.path.isfile(vsp_file):
        return {
            'designId': design_id, 'status': 'error', 'method': 'vspaero',
            'message':  f"vsp3 file not found: {vsp_file}",
        }

    # VSPAERO writes its output files next to the vsp3 – we must cd there
    work_dir = os.path.dirname(os.path.abspath(vsp_file))
    os.chdir(work_dir)   # safe: each Python subprocess has its own CWD

    try:
        vsp.ReadVSPFile(vsp_file)

        # ── Remove solid bodies that VLM cannot mesh ───────────────────
        # VSPAERO's VLM solver works on thin lifting surfaces. A FUSELAGE
        # solid body frequently produces a degenerate mesh. We keep the
        # wings/tails only for the aerodynamic analysis.
        for gid in vsp.FindGeoms():
            try:
                geom_type = vsp.GetGeomTypeName(gid)
                name = (vsp.GetGeomName(gid) or '').lower()
                if geom_type == 'FUSELAGE' or name == 'fuselage':
                    vsp.DeleteGeom(gid)
            except Exception:
                pass
        vsp.Update()

        # ── Compute geometry (VLM, thin-surface only) ──────────────────
        cg = 'VSPAEROComputeGeometry'
        vsp.SetAnalysisInputDefaults(cg)
        vsp.SetIntAnalysisInput(cg, 'GeomSet',        [vsp.SET_NONE], 0)
        vsp.SetIntAnalysisInput(cg, 'ThinGeomSet',    [1],            0)  # default active set
        vsp.ExecAnalysis(cg)

        # ── Alpha sweep ────────────────────────────────────────────────
        sweep = 'VSPAEROSweep'
        vsp.SetAnalysisInputDefaults(sweep)
        vsp.SetIntAnalysisInput(sweep,    'WakeNumIter',    [3], 0)
        vsp.SetIntAnalysisInput(sweep,    'GeomSet',        [vsp.SET_NONE], 0)
        vsp.SetIntAnalysisInput(sweep,    'ThinGeomSet',    [1],            0)
        vsp.SetDoubleAnalysisInput(sweep, 'Sref',       [wing_area], 0)
        vsp.SetDoubleAnalysisInput(sweep, 'bref',       [wingspan],  0)
        vsp.SetDoubleAnalysisInput(sweep, 'cref',       [mac],       0)
        vsp.SetDoubleAnalysisInput(sweep, 'MachStart',  [mach], 0)
        vsp.SetDoubleAnalysisInput(sweep, 'MachEnd',    [mach], 0)
        vsp.SetIntAnalysisInput(sweep,    'MachNpts',   [1],    0)
        vsp.SetDoubleAnalysisInput(sweep, 'AlphaStart', [alpha_start], 0)
        vsp.SetDoubleAnalysisInput(sweep, 'AlphaEnd',   [alpha_end],   0)
        n_pts = int(round((alpha_end - alpha_start) / alpha_step)) + 1
        vsp.SetIntAnalysisInput(sweep, 'AlphaNpts', [n_pts], 0)
        vsp.SetDoubleAnalysisInput(sweep, 'BetaStart', [0.0], 0)
        vsp.SetDoubleAnalysisInput(sweep, 'BetaEnd',   [0.0], 0)
        vsp.SetIntAnalysisInput(sweep,    'BetaNpts',  [1],   0)
        vsp.ExecAnalysis(sweep)

        # ── Extract results ────────────────────────────────────────────
        res_names = vsp.GetAllResultsNames()
        if not res_names:
            raise Exception("No VSPAERO results – solver likely diverged.")

        # VSPAERO writes multiple result sets; the polar summary is what we need.
        polar_name = 'VSPAERO_Polar'
        if polar_name not in res_names:
            raise Exception(f"{polar_name} result set not found – VSPAERO failed silently.")

        res_id     = vsp.FindResultsID(polar_name)
        data_names = vsp.GetAllDataNames(res_id)

        def col(label):
            for d in data_names:
                if d.lower() == label.lower():
                    return [_clean(v) for v in vsp.GetDoubleResults(res_id, d)]
            return []

        alphas = col('Alpha')
        cls    = col('CLtot') or col('CL')
        cds    = col('CDtot') or col('CD')
        cms    = col('CMytot') or col('CMy') or col('Cm')

        if not alphas:
            raise Exception("No Alpha column in results – geometry / mesh failed.")

        if all(abs(v) < 1e-9 for v in cls):
            raise Exception(
                "All CL values are zero – degenerate mesh. "
                "Likely cause: tail arms exceed fuselage length, or fuselage too wide."
            )

        # ── Build sweep table ──────────────────────────────────────────
        sweep_data = []
        for i, a in enumerate(alphas):
            CL = cls[i] if i < len(cls) else 0.0
            CD = cds[i] if i < len(cds) else 0.001
            CD = CD if abs(CD) > 1e-6 else 0.001
            CM = cms[i] if i < len(cms) else 0.0
            sweep_data.append({
                'alpha': round(a,  2),
                'CL':   round(CL, 4),
                'CD':   round(CD, 4),
                'LD':   round(CL / CD, 2),
                'CM':   round(CM, 4),
            })

        valid = [p for p in sweep_data if p['CL'] > 0.001]
        if valid:
            best         = max(valid, key=lambda p: p['LD'])
            max_ld       = best['LD']
            max_ld_alpha = best['alpha']
            cruise_cl    = best['CL']
        else:
            max_ld = max_ld_alpha = cruise_cl = 0.0

        max_cl = max((p['CL'] for p in sweep_data), default=0.0)

        return {
            'designId':    design_id,
            'status':      'completed',
            'method':      'vspaero',
            'alphaSweep':  sweep_data,
            'maxLD':       round(max_ld,       2),
            'maxLD_alpha': round(max_ld_alpha, 2),
            'maxCL':       round(max_cl,       4),
            'cruiseCL':    round(cruise_cl,    4),
            'wingArea':    params.get('wingArea', 0),
            'mach':        mach,
            'vspFile':     vsp_file,
            'message':     f'VSPAERO done. Max L/D={max_ld:.1f} at α={max_ld_alpha:.1f}°',
        }

    except Exception as e:
        import traceback
        return {
            'designId': design_id, 'status': 'error', 'method': 'vspaero',
            'message':  f'{e}\n{traceback.format_exc()}',
        }


if __name__ == '__main__':
    import time, random, traceback
    time.sleep(random.uniform(0.05, 0.3))
    try:
        params = json.loads(sys.stdin.read())
        result = run_vspaero(params)
        print("\n===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===\n")
        sys.stdout.flush()
        try: os.close(1); os.close(2)
        except: pass
        os._exit(0)
    except Exception as e:
        print("\n===JSON_START===")
        print(json.dumps({"status": "error", "message": str(e)}))
        print("===JSON_END===\n")
        sys.stdout.flush()
        try: os.close(1); os.close(2)
        except: pass
        os._exit(1)