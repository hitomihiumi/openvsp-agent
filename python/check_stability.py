import sys
import json
import os
import math
import ctypes

if os.name == 'nt':
    try: ctypes.windll.kernel32.SetErrorMode(0x0002 | 0x8000)
    except: pass

def check_stability(params):
    design_id = params.get('designId', 'unknown')

    run_dir = os.path.abspath(f"run_{design_id}")
    if os.path.exists(run_dir):
        os.chdir(run_dir)

    try:
        filename = f'{design_id}.vsp3'
        if not os.path.exists(filename):
            raise Exception(f"Geometry file {filename} not found.")

        import openvsp as vsp
        vsp.ReadVSPFile(filename)

        compgeom_analysis = 'VSPAEROComputeGeometry'
        vsp.SetAnalysisInputDefaults(compgeom_analysis)
        vsp.SetIntAnalysisInput(compgeom_analysis, 'GeomSet', [vsp.SET_NONE], 0)
        vsp.SetIntAnalysisInput(compgeom_analysis, 'ThinGeomSet', [vsp.SET_ALL], 0)
        vsp.ExecAnalysis(compgeom_analysis)

        analysis_name = 'VSPAEROSweep'

        vsp.SetAnalysisInputDefaults(analysis_name)
        vsp.SetDoubleAnalysisInput(analysis_name, 'AlphaStart', [-1.0], 0)
        vsp.SetDoubleAnalysisInput(analysis_name, 'AlphaEnd', [1.0], 0)
        vsp.SetIntAnalysisInput(analysis_name, 'AlphaNpts', [3], 0)
        vsp.ExecAnalysis(analysis_name)

        res_names_alpha = vsp.GetAllResultsNames()
        if not res_names_alpha:
            raise Exception("Alpha sweep failed.")
        res_id_alpha = vsp.FindResultsID(res_names_alpha[-1])
        data_names_alpha = vsp.GetAllDataNames(res_id_alpha)

        def get_aero_data(res_id, names, target):
            for d in names:
                if d.lower() == target.lower():
                    raw_data = vsp.GetDoubleResults(res_id, d)
                    return [0.0 if math.isnan(v) or math.isinf(v) else v for v in raw_data]
            return []

        alphas = get_aero_data(res_id_alpha, data_names_alpha, 'Alpha')
        cls = get_aero_data(res_id_alpha, data_names_alpha, 'CL')
        cms = get_aero_data(res_id_alpha, data_names_alpha, 'CMy')
        if not cms:
            cms = get_aero_data(res_id_alpha, data_names_alpha, 'Cm')

        cl_alpha_val = 0
        cm_alpha_val = 0
        if len(alphas) >= 3 and len(cls) >= 3 and len(cms) >= 3:
            da = alphas[-1] - alphas[0]
            if da != 0:
                cl_alpha_val = (cls[-1] - cls[0]) / da
                cm_alpha_val = (cms[-1] - cms[0]) / da

        static_margin = -(cm_alpha_val / cl_alpha_val) * 100 if cl_alpha_val != 0 else 0

        vsp.SetAnalysisInputDefaults(analysis_name)
        vsp.SetDoubleAnalysisInput(analysis_name, 'AlphaStart', [0.0], 0)
        vsp.SetDoubleAnalysisInput(analysis_name, 'AlphaEnd', [0.0], 0)
        vsp.SetIntAnalysisInput(analysis_name, 'AlphaNpts', [1], 0)
        vsp.SetDoubleAnalysisInput(analysis_name, 'BetaStart', [-1.0], 0)
        vsp.SetDoubleAnalysisInput(analysis_name, 'BetaEnd', [1.0], 0)
        vsp.SetIntAnalysisInput(analysis_name, 'BetaNpts', [3], 0)
        vsp.ExecAnalysis(analysis_name)

        res_names_beta = vsp.GetAllResultsNames()
        if not res_names_beta:
            raise Exception("Beta sweep failed.")
        res_id_beta = vsp.FindResultsID(res_names_beta[-1])
        data_names_beta = vsp.GetAllDataNames(res_id_beta)

        betas = get_aero_data(res_id_beta, data_names_beta, 'Beta')
        cns = get_aero_data(res_id_beta, data_names_beta, 'CN')
        if not cns:
            cns = get_aero_data(res_id_beta, data_names_beta, 'CNz')
        cls_roll = get_aero_data(res_id_beta, data_names_beta, 'Cl')

        cn_beta_val = 0
        cl_beta_val = 0
        if len(betas) >= 3 and len(cns) >= 3 and len(cls_roll) >= 3:
            db = betas[-1] - betas[0]
            if db != 0:
                cn_beta_val = (cns[-1] - cns[0]) / db
                cl_beta_val = (cls_roll[-1] - cls_roll[0]) / db

        longitudinal_stable = cm_alpha_val < 0 and static_margin > 0
        directional_stable = cn_beta_val > 0
        lateral_stable = cl_beta_val < 0

        return {
            'designId': design_id,
            'status': 'completed',
            'method': 'vspaero-stability',
            'longitudinal': { 'staticMargin': round(static_margin, 2), 'stable': longitudinal_stable },
            'directional': { 'CN_beta': round(cn_beta_val, 4), 'stable': directional_stable },
            'lateral': { 'Cl_beta': round(cl_beta_val, 4), 'stable': lateral_stable },
            'overallStable': longitudinal_stable and directional_stable and lateral_stable,
            'message': f'Stability check done. SM={static_margin:.1f}%',
        }

    except Exception as e:
        return { 'designId': design_id, 'status': 'error', 'method': 'vspaero-stability', 'message': str(e) }

if __name__ == '__main__':
    import time, random, traceback
    time.sleep(random.uniform(0.1, 0.5))
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            raise Exception("Empty input data")
        params = json.loads(input_data)
        result = check_stability(params)

        # ТЕГИ ДЛЯ NODE.JS
        print("\n===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===\n")

        sys.stdout.flush()
        try: os.close(1); os.close(2)
        except: pass
        os._exit(0)
    except Exception as e:
        print("\n===JSON_START===")
        print(json.dumps({ "status": "error", "message": str(e) }))
        print("===JSON_END===\n")
        sys.stdout.flush()
        try: os.close(1); os.close(2)
        except: pass
        os._exit(1)