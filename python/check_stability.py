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


def _col(res_id, data_names, label):
    for d in data_names:
        if d.lower() == label.lower():
            return [_clean(v) for v in vsp.GetDoubleResults(res_id, d)]
    return []


def _sweep(name, sweep_params, wing_area, wingspan, mac):
    vsp.SetAnalysisInputDefaults(name)
    vsp.SetIntAnalysisInput(name, 'WakeNumIter',    [3], 0)
    vsp.SetIntAnalysisInput(name, 'GeomSet',        [vsp.SET_NONE], 0)
    vsp.SetIntAnalysisInput(name, 'ThinGeomSet',    [1],            0)
    vsp.SetDoubleAnalysisInput(name, 'Sref', [wing_area], 0)
    vsp.SetDoubleAnalysisInput(name, 'bref', [wingspan],  0)
    vsp.SetDoubleAnalysisInput(name, 'cref', [mac],       0)
    for k, v_list in sweep_params.items():
        sample = v_list[0] if v_list else None
        if isinstance(sample, float):
            vsp.SetDoubleAnalysisInput(name, k, v_list, 0)
        elif isinstance(sample, int):
            vsp.SetIntAnalysisInput(name, k, v_list, 0)
    vsp.ExecAnalysis(name)
    names = vsp.GetAllResultsNames()
    if 'VSPAERO_Polar' not in names:
        return None, []
    rid = vsp.FindResultsID('VSPAERO_Polar')
    return rid, vsp.GetAllDataNames(rid)


def check_stability(params):
    design_id = params.get('designId', 'unknown')

    # Geometry reference values
    wingspan   = float(params.get('wingspan', 0.0))
    wing_chord = float(params.get('wingChord', 0.0))
    wing_tip   = float(params.get('wingTipChord', 0.0))
    wing_area  = float(params.get('wingArea', 0.0))

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

    # ── Resolve vsp3 path (same logic as run_vspaero) ──────────────────
    vsp_file = params.get('vspFile')
    if not vsp_file:
        run_dir  = params.get('runDir') or os.path.abspath(f"run_{design_id}")
        vsp_file = os.path.join(run_dir, f'{design_id}.vsp3')

    if not os.path.isfile(vsp_file):
        return {
            'designId': design_id, 'status': 'error', 'method': 'vspaero-stability',
            'message':  f"vsp3 file not found: {vsp_file}",
        }

    work_dir = os.path.dirname(os.path.abspath(vsp_file))
    os.chdir(work_dir)

    try:
        vsp.ReadVSPFile(vsp_file)

        # Remove solid bodies that VLM cannot mesh properly
        for gid in vsp.FindGeoms():
            try:
                geom_type = vsp.GetGeomTypeName(gid)
                name = (vsp.GetGeomName(gid) or '').lower()
                if geom_type == 'FUSELAGE' or name == 'fuselage':
                    vsp.DeleteGeom(gid)
            except Exception:
                pass
        vsp.Update()

        # Mesh
        cg = 'VSPAEROComputeGeometry'
        vsp.SetAnalysisInputDefaults(cg)
        vsp.SetIntAnalysisInput(cg, 'GeomSet',        [vsp.SET_NONE], 0)
        vsp.SetIntAnalysisInput(cg, 'ThinGeomSet',    [1],            0)  # default active set
        vsp.ExecAnalysis(cg)

        sweep = 'VSPAEROSweep'

        # ── Longitudinal (alpha sweep) ──────────────────────────────────
        rid_a, dn_a = _sweep(sweep, {
            'AlphaStart': [-2.0], 'AlphaEnd': [2.0], 'AlphaNpts': [5],
            'BetaStart':  [0.0],  'BetaEnd':  [0.0], 'BetaNpts':  [1],
            'MachStart':  [0.065], 'MachEnd': [0.065], 'MachNpts': [1],
        }, wing_area, wingspan, mac)
        if rid_a is None:
            raise Exception("Alpha sweep returned no results.")

        alphas = _col(rid_a, dn_a, 'Alpha')
        cls    = _col(rid_a, dn_a, 'CLtot') or _col(rid_a, dn_a, 'CL')
        cms    = _col(rid_a, dn_a, 'CMytot') or _col(rid_a, dn_a, 'CMy') or _col(rid_a, dn_a, 'Cm')

        cl_alpha = cm_alpha = 0.0
        if len(alphas) >= 2 and abs(alphas[-1] - alphas[0]) > 1e-6:
            da       = alphas[-1] - alphas[0]
            cl_alpha = (cls[-1] - cls[0]) / da if cls else 0.0
            cm_alpha = (cms[-1] - cms[0]) / da if cms else 0.0

        static_margin = -(cm_alpha / cl_alpha) * 100.0 if abs(cl_alpha) > 1e-6 else 0.0
        long_stable   = (cm_alpha < 0) and (static_margin > 0)

        # ── Directional / lateral (beta sweep) ─────────────────────────
        rid_b, dn_b = _sweep(sweep, {
            'AlphaStart': [0.0],   'AlphaEnd': [0.0],  'AlphaNpts': [1],
            'BetaStart':  [-3.0],  'BetaEnd':  [3.0],  'BetaNpts':  [7],
            'MachStart':  [0.065], 'MachEnd':  [0.065],'MachNpts':  [1],
        }, wing_area, wingspan, mac)
        if rid_b is None:
            raise Exception("Beta sweep returned no results.")

        betas    = _col(rid_b, dn_b, 'Beta')
        cns      = _col(rid_b, dn_b, 'CNtot') or _col(rid_b, dn_b, 'CN') or _col(rid_b, dn_b, 'CNz')
        cls_roll = _col(rid_b, dn_b, 'Cltot') or _col(rid_b, dn_b, 'Cl')

        cn_beta = cl_beta = 0.0
        if len(betas) >= 2 and abs(betas[-1] - betas[0]) > 1e-6:
            db      = betas[-1] - betas[0]
            cn_beta = (cns[-1]      - cns[0])      / db if cns      else 0.0
            cl_beta = (cls_roll[-1] - cls_roll[0]) / db if cls_roll else 0.0

        dir_stable = cn_beta > 0
        lat_stable = cl_beta < 0

        return {
            'designId': design_id,
            'status':   'completed',
            'method':   'vspaero-stability',
            'vspFile':  vsp_file,
            'longitudinal': {
                'CL_alpha':    round(cl_alpha,    4),
                'CM_alpha':    round(cm_alpha,    4),
                'staticMargin': round(static_margin, 2),
                'stable':      long_stable,
            },
            'directional': {'CN_beta': round(cn_beta, 4), 'stable': dir_stable},
            'lateral':     {'Cl_beta': round(cl_beta, 4), 'stable': lat_stable},
            'overallStable': long_stable and dir_stable and lat_stable,
            'message': (
                f'SM={static_margin:.1f}%, '
                f'CN_β={cn_beta:.4f}, Cl_β={cl_beta:.4f}'
            ),
        }

    except Exception as e:
        import traceback
        return {
            'designId': design_id, 'status': 'error', 'method': 'vspaero-stability',
            'message':  f'{e}\n{traceback.format_exc()}',
        }


if __name__ == '__main__':
    import time, random, traceback
    time.sleep(random.uniform(0.05, 0.3))
    try:
        params = json.loads(sys.stdin.read())
        result = check_stability(params)
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