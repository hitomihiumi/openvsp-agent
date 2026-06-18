import sys
import json
import os
import math
import ctypes

# Отключаем всплывающие окна ошибок Windows при краше решателя
if os.name == 'nt':
    try: ctypes.windll.kernel32.SetErrorMode(0x0002 | 0x8000)
    except: pass

def run_vspaero(params):
    design_id = params.get('designId', 'unknown')

    run_dir = os.path.abspath(f"run_{design_id}")
    if os.path.exists(run_dir):
        os.chdir(run_dir)

    alpha_start = params.get('alphaStart', -2)
    alpha_end = params.get('alphaEnd', 12)
    alpha_step = params.get('alphaStep', 1)
    mach = params.get('machNumber', 0.065)

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

        vsp.SetDoubleAnalysisInput(analysis_name, 'MachStart', [float(mach)], 0)
        vsp.SetDoubleAnalysisInput(analysis_name, 'AlphaStart', [float(alpha_start)], 0)
        vsp.SetDoubleAnalysisInput(analysis_name, 'AlphaEnd', [float(alpha_end)], 0)

        n_points = int((alpha_end - alpha_start) / alpha_step) + 1
        vsp.SetIntAnalysisInput(analysis_name, 'AlphaNpts', [n_points], 0)

        vsp.ExecAnalysis(analysis_name)

        res_names = vsp.GetAllResultsNames()
        if not res_names:
            raise Exception("Solver diverged or no results found.")
        res_id = vsp.FindResultsID(res_names[-1])

        data_names = vsp.GetAllDataNames(res_id)

        def get_data(name):
            for d in data_names:
                if d.lower() == name.lower():
                    raw_data = vsp.GetDoubleResults(res_id, d)
                    return [0.0 if math.isnan(v) or math.isinf(v) else v for v in raw_data]
            return []

        alpha_vals = get_data('Alpha')
        cl_vals = get_data('CL')
        cd_vals = get_data('CD')
        cm_vals = get_data('CMy')
        if not cm_vals:
            cm_vals = get_data('Cm')

        alpha_sweep = []
        for i in range(len(alpha_vals)):
            CL = cl_vals[i] if i < len(cl_vals) else 0
            CD = cd_vals[i] if i < len(cd_vals) else 0.001
            if CD == 0: CD = 0.001
            LD = CL / CD
            CM = cm_vals[i] if i < len(cm_vals) else 0
            alpha_sweep.append({
                'alpha': round(alpha_vals[i], 2),
                'CL': round(CL, 4),
                'CD': round(CD, 4),
                'LD': round(LD, 2),
                'CM': round(CM, 4),
            })

        max_ld = max((x['LD'] for x in alpha_sweep), default=0) if alpha_sweep else 0
        max_ld_alpha = max((x['alpha'] for x in alpha_sweep if x['LD'] == max_ld), default=0) if alpha_sweep else 0

        return {
            'designId': design_id,
            'status': 'completed',
            'method': 'vspaero',
            'alphaSweep': alpha_sweep,
            'maxLD': max_ld,
            'maxLD_alpha': max_ld_alpha,
            'maxCL': max((r['CL'] for r in alpha_sweep), default=0) if alpha_sweep else 0,
            'wingArea': params.get('wingArea', 0),
            'mach': mach,
            'message': f'VSPAERO analysis complete. Max L/D: {max_ld:.1f}',
        }

    except Exception as e:
        return { 'designId': design_id, 'status': 'error', 'method': 'vspaero', 'message': str(e) }

if __name__ == '__main__':
    import time, random, traceback
    time.sleep(random.uniform(0.1, 0.5))
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            raise Exception("Empty input data")
        params = json.loads(input_data)
        result = run_vspaero(params)

        # ПЕЧАТАЕМ ТЕГИ, ЧТОБЫ NODE.JS СМОГ ИХ НАЙТИ
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