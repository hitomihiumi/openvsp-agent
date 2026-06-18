import sys
import json
import math
import os
import ctypes

if os.name == 'nt':
    try: ctypes.windll.kernel32.SetErrorMode(0x0002 | 0x8000)
    except: pass

def create_drone_geometry(params):
    design_id = params.get('designId', 'unknown')

    run_dir = os.path.abspath(f"run_{design_id}")
    os.makedirs(run_dir, exist_ok=True)
    os.chdir(run_dir)

    wingspan = params.get('wingspan', 1.5)
    wing_chord = params.get('wingChord', 0.25)
    wing_tip_chord = params.get('wingTipChord', 0.15)
    wing_airfoil = params.get('wingAirfoil', 'Eppler387')
    htail_area = params.get('htailArea', 0.1)
    vtail_area = params.get('vtailArea', 0.05)
    htail_arm = params.get('htailArm', 0.6)
    vtail_arm = params.get('vtailArm', 0.6)
    fuselage_length = params.get('fuselageLength', 1.0)
    fuselage_width = params.get('fuselageWidth', 0.1)
    wing_position = params.get('wingPosition', 0.3)
    cg_position = params.get('cgPosition', 0.38)

    try:
        import openvsp as vsp

        vsp.VSPRenew()

        fuse_id = vsp.AddGeom('FUSELAGE', '')
        vsp.SetGeomName(fuse_id, 'Fuselage')
        vsp.SetParmVal(fuse_id, 'Length', 'Design', fuselage_length)

        vsp.SetParmVal(fuse_id, 'Ellipse_Width', 'XSecCurve_1', fuselage_width)
        vsp.SetParmVal(fuse_id, 'Ellipse_Height', 'XSecCurve_1', fuselage_width)
        vsp.SetParmVal(fuse_id, 'Ellipse_Width', 'XSecCurve_2', fuselage_width)
        vsp.SetParmVal(fuse_id, 'Ellipse_Height', 'XSecCurve_2', fuselage_width)

        wing_id = vsp.AddGeom('WING', '')
        vsp.SetGeomName(wing_id, 'Wing')

        vsp.SetParmVal(wing_id, 'Span', 'XSec_1', wingspan / 2.0)
        vsp.SetParmVal(wing_id, 'Root_Chord', 'XSec_1', wing_chord)
        vsp.SetParmVal(wing_id, 'Tip_Chord', 'XSec_1', wing_tip_chord)
        vsp.SetParmVal(wing_id, 'X_Rel_Location', 'XForm', wing_position * fuselage_length)
        vsp.SetParmVal(wing_id, 'Z_Rel_Location', 'XForm', 0.0)

        htail_id = vsp.AddGeom('WING', '')
        vsp.SetGeomName(htail_id, 'H-Tail')
        htail_span = math.sqrt(htail_area * 2.5)
        htail_chord = htail_area / htail_span * 2

        vsp.SetParmVal(htail_id, 'Span', 'XSec_1', htail_span / 2.0)
        vsp.SetParmVal(htail_id, 'Root_Chord', 'XSec_1', htail_chord)
        vsp.SetParmVal(htail_id, 'Tip_Chord', 'XSec_1', htail_chord * 0.6)
        vsp.SetParmVal(htail_id, 'X_Rel_Location', 'XForm', htail_arm + 0.25 * htail_chord)
        vsp.SetParmVal(htail_id, 'Z_Rel_Location', 'XForm', 0.0)

        vtail_id = vsp.AddGeom('WING', '')
        vsp.SetGeomName(vtail_id, 'V-Tail')
        vtail_span = math.sqrt(vtail_area * 1.5)
        vtail_chord = vtail_area / vtail_span * 2

        vsp.SetParmVal(vtail_id, 'Span', 'XSec_1', vtail_span)
        vsp.SetParmVal(vtail_id, 'Root_Chord', 'XSec_1', vtail_chord)
        vsp.SetParmVal(vtail_id, 'Tip_Chord', 'XSec_1', vtail_chord * 0.6)
        vsp.SetParmVal(vtail_id, 'X_Rel_Location', 'XForm', vtail_arm + 0.25 * vtail_chord)
        vsp.SetParmVal(vtail_id, 'Z_Rel_Location', 'XForm', 0.0)

        vsp.SetParmVal(vtail_id, 'Sym_Planar_Flag', 'Sym', 0)
        vsp.SetParmVal(vtail_id, 'X_Rotation', 'XForm', 90.0)

        vsp.Update()

        filename = f'{design_id}.vsp3'
        vsp.WriteVSPFile(filename)

        wing_area = ((wing_chord + wing_tip_chord) / 2) * wingspan
        aspect_ratio = (wingspan * wingspan) / wing_area

        result = {
            'designId': design_id,
            'status': 'created',
            'method': 'openvsp',
            'description': params.get('description', ''),
            'parameters': {
                'wingspan': wingspan,
                'wingChord': wing_chord,
                'wingTipChord': wing_tip_chord,
                'wingArea': round(wing_area, 4),
                'aspectRatio': round(aspect_ratio, 2),
                'htailArea': htail_area,
                'vtailArea': vtail_area,
                'wingAirfoil': wing_airfoil,
                'fuselageLength': fuselage_length,
                'cgPosition': cg_position,
                'vspFile': filename,
            },
            'message': f'OpenVSP geometry created. Wing area: {wing_area:.3f} m^2, AR: {aspect_ratio:.1f}',
        }
        return result

    except ImportError as e:
        return { 'designId': design_id, 'status': 'error', 'method': 'openvsp', 'message': f'ImportError: {str(e)}' }
    except Exception as e:
        return { 'designId': design_id, 'status': 'error', 'method': 'openvsp', 'message': f'Error: {str(e)}' }

if __name__ == '__main__':
    import time, random, traceback
    time.sleep(random.uniform(0.1, 1))

    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            raise Exception("Empty input data")

        params = json.loads(input_data)
        result = create_drone_geometry(params)

        print("\n===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===\n")
        sys.stdout.flush()

        try: os.close(1); os.close(2)
        except: pass
        os._exit(0)
    except Exception as e:
        error_msg = f"Python Execution Error: {str(e)}\n{traceback.format_exc()}"
        print("\n===JSON_START===")
        print(json.dumps({
            "status": "error",
            "method": "python_wrapper",
            "message": error_msg
        }))
        print("===JSON_END===\n")
        sys.stdout.flush()
        try: os.close(1); os.close(2)
        except: pass
        os._exit(1)