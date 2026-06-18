import sys
import json
import math
import os
import ctypes
import openvsp_config
openvsp_config.LOAD_GRAPHICS = False
openvsp_config.LOAD_FACADE = True
import openvsp as vsp

if os.name == 'nt':
    try: ctypes.windll.kernel32.SetErrorMode(0x0002 | 0x8000)
    except: pass


def create_drone_geometry(params):
    design_id = params.get('designId', 'unknown')
    aircraft_type = (params.get('aircraftType') or 'fixed-wing').lower().strip()

    # ── Directory: use absolute path passed from JS, or derive it ──────
    # JS now passes 'runDir' as absolute path; fall back to cwd-based path
    run_dir = params.get('runDir') or os.path.abspath(f"run_{design_id}")
    os.makedirs(run_dir, exist_ok=True)

    # All file I/O uses absolute paths – never rely on cwd
    vsp_file = os.path.join(run_dir, f'{design_id}.vsp3')

    wingspan       = params.get('wingspan', 1.5)
    wing_chord     = params.get('wingChord', 0.25)
    wing_tip_chord = params.get('wingTipChord', 0.15)
    wing_airfoil   = params.get('wingAirfoil', 'Eppler387')
    htail_area     = params.get('htailArea', 0.10)
    vtail_area     = params.get('vtailArea', 0.05)
    htail_arm      = params.get('htailArm', 0.6)
    vtail_arm      = params.get('vtailArm', 0.6)
    fuse_len       = params.get('fuselageLength', 1.0)
    fuse_width     = params.get('fuselageWidth', 0.10)
    cg_frac        = params.get('cgPosition', 0.38)
    wing_frac      = params.get('wingPosition', 0.30)

    # Derived absolute X positions
    cg_x      = cg_frac  * fuse_len
    wing_le_x = wing_frac * fuse_len
    htail_x   = cg_x + htail_arm
    vtail_x   = cg_x + vtail_arm

    # Safety clamps
    htail_x   = min(htail_x,   fuse_len * 0.95)
    vtail_x   = min(vtail_x,   fuse_len * 0.95)
    wing_le_x = min(wing_le_x, cg_x - 0.05)
    wing_le_x = max(wing_le_x, 0.05)

    # Pre-compute wing area for tail sizing defaults
    wing_area = ((wing_chord + wing_tip_chord) / 2.0) * wingspan

    try:
        vsp.VSPRenew()
        vsp.ClearVSPModel()

        # ── FUSELAGE ────────────────────────────────────────────────────
        fuse_id = vsp.AddGeom('FUSELAGE', '')
        vsp.SetGeomName(fuse_id, 'Fuselage')
        vsp.SetParmVal(fuse_id, 'Length', 'Design', fuse_len)

        r = fuse_width / 2.0
        for idx, frac in enumerate([0.0, 0.5, 1.0, 1.0, 0.8, 0.0]):
            try:
                vsp.SetParmVal(fuse_id, 'Ellipse_Width',  f'XSecCurve_{idx}', r * frac * 2)
                vsp.SetParmVal(fuse_id, 'Ellipse_Height', f'XSecCurve_{idx}', r * frac * 2)
            except Exception:
                pass

        # ── MAIN WING ───────────────────────────────────────────────────
        wing_id = vsp.AddGeom('WING', '')
        vsp.SetGeomName(wing_id, 'Wing')
        vsp.SetParmVal(wing_id, 'Span',            'XSec_1', wingspan / 2.0)
        vsp.SetParmVal(wing_id, 'Root_Chord',      'XSec_1', wing_chord)
        vsp.SetParmVal(wing_id, 'Tip_Chord',       'XSec_1', wing_tip_chord)
        vsp.SetParmVal(wing_id, 'Sym_Planar_Flag', 'Sym',    vsp.SYM_XZ)
        vsp.SetParmVal(wing_id, 'X_Rel_Location',  'XForm',  wing_le_x)
        vsp.SetParmVal(wing_id, 'Y_Rel_Location',  'XForm',  0.0)
        vsp.SetParmVal(wing_id, 'Z_Rel_Location',  'XForm',  0.0)

        # ── AIRFOIL ─────────────────────────────────────────────────────
        # Best-effort: try the common parameter names used by OpenVSP
        try:
            for xsec_idx in [0, 1]:
                for curve_name in [f'XSecCurve_{xsec_idx}', 'XSecCurve']:
                    try:
                        vsp.SetParmVal(wing_id, 'Airfoil_Name', curve_name, wing_airfoil)
                    except Exception:
                        pass
        except Exception:
            pass

        # ── HORIZONTAL & VERTICAL TAILS ─────────────────────────────────
        # Tails are created for all fixed-wing / airplane / glider / UAV types.
        # Only pure rotary-wing types (multirotor, helicopter, quadcopter) skip them.
        non_fixed_wing = {'multirotor', 'helicopter', 'quadcopter', 'rotorcraft', 'copter'}
        build_tails = aircraft_type not in non_fixed_wing

        if build_tails:
            # Use sensible defaults if tail areas are missing or zero
            if htail_area <= 0:
                htail_area = 0.20 * wing_area if wing_area > 0 else 0.10
            if vtail_area <= 0:
                vtail_area = 0.08 * wing_area if wing_area > 0 else 0.05

            htail_id    = vsp.AddGeom('WING', '')
            vsp.SetGeomName(htail_id, 'H-Tail')
            htail_span  = math.sqrt(htail_area * 4.0)
            htail_chord = htail_area / htail_span
            vsp.SetParmVal(htail_id, 'Span',            'XSec_1', htail_span / 2.0)
            vsp.SetParmVal(htail_id, 'Root_Chord',      'XSec_1', htail_chord)
            vsp.SetParmVal(htail_id, 'Tip_Chord',       'XSec_1', htail_chord * 0.7)
            vsp.SetParmVal(htail_id, 'Sym_Planar_Flag', 'Sym',    vsp.SYM_XZ)
            vsp.SetParmVal(htail_id, 'X_Rel_Location',  'XForm',  htail_x)
            vsp.SetParmVal(htail_id, 'Y_Rel_Location',  'XForm',  0.0)
            vsp.SetParmVal(htail_id, 'Z_Rel_Location',  'XForm',  0.0)

            vtail_id    = vsp.AddGeom('WING', '')
            vsp.SetGeomName(vtail_id, 'V-Tail')
            vtail_span  = math.sqrt(vtail_area * 1.5)
            vtail_chord = vtail_area / vtail_span
            vsp.SetParmVal(vtail_id, 'Span',            'XSec_1', vtail_span)
            vsp.SetParmVal(vtail_id, 'Root_Chord',      'XSec_1', vtail_chord)
            vsp.SetParmVal(vtail_id, 'Tip_Chord',       'XSec_1', vtail_chord * 0.6)
            vsp.SetParmVal(vtail_id, 'Sym_Planar_Flag', 'Sym',    0)
            vsp.SetParmVal(vtail_id, 'X_Rel_Rotation',  'XForm',  90.0)
            vsp.SetParmVal(vtail_id, 'X_Rel_Location',  'XForm',  vtail_x)
            vsp.SetParmVal(vtail_id, 'Y_Rel_Location',  'XForm',  0.0)
            vsp.SetParmVal(vtail_id, 'Z_Rel_Location',  'XForm',  fuse_width / 2.0)

        vsp.Update()

        # Write to ABSOLUTE path
        vsp.WriteVSPFile(vsp_file)

        if not os.path.exists(vsp_file):
            raise Exception(f"WriteVSPFile silently failed – {vsp_file} not created.")

        aspect_ratio = (wingspan ** 2) / wing_area
        mac          = wing_chord  # simplified (trapezoidal MAC ≈ root for low taper)
        htail_vol    = (htail_area * htail_arm) / (wing_area * mac) if wing_area * mac > 0 else 0.0
        vtail_vol    = (vtail_area * vtail_arm) / (wing_area * wingspan) if wing_area * wingspan > 0 else 0.0

        return {
            'designId':    design_id,
            'status':      'created',
            'method':      'openvsp',
            'description': params.get('description', ''),
            'runDir':      run_dir,
            'parameters': {
                'wingspan':       wingspan,
                'wingChord':      wing_chord,
                'wingTipChord':   wing_tip_chord,
                'wingArea':       round(wing_area, 4),
                'aspectRatio':    round(aspect_ratio, 2),
                'htailArea':      htail_area,
                'vtailArea':      vtail_area,
                'htailVol':       round(htail_vol, 3),
                'vtailVol':       round(vtail_vol, 3),
                'wingAirfoil':    wing_airfoil,
                'fuselageLength': fuse_len,
                'fuselageWidth':  fuse_width,
                'cgPosition':     cg_frac,
                'cgX':            round(cg_x, 3),
                'wingLeX':        round(wing_le_x, 3),
                'htailX':         round(htail_x, 3),
                'vtailX':         round(vtail_x, 3),
                'vspFile':        vsp_file,   # ← absolute path
            },
            'message': (
                f'Geometry saved to {vsp_file}. '
                f'AR={aspect_ratio:.1f}, HT-vol={htail_vol:.3f}, VT-vol={vtail_vol:.3f}'
            ),
        }

    except Exception as e:
        import traceback
        return {
            'designId': design_id, 'status': 'error', 'method': 'openvsp',
            'message':  f'{e}\n{traceback.format_exc()}',
        }


if __name__ == '__main__':
    import time, random, traceback
    time.sleep(random.uniform(0.05, 0.3))
    try:
        params = json.loads(sys.stdin.read())
        result = create_drone_geometry(params)
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