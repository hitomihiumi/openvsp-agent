import sys
import os

# Корневая папка для DLL файлов
vsp_root = r"D:\programs\OpenVSP-3.50.5-win64"

# Точный путь до папки, где лежит vsp.py
vsp_python_dir = r"D:\programs\OpenVSP-3.50.5-win64\python\openvsp\openvsp"

sys.path.insert(0, vsp_python_dir)

# Подтягиваем C++ библиотеки (DLL)
if os.name == 'nt':
    os.environ['PATH'] = vsp_root + os.pathsep + os.environ.get('PATH', '')
    if hasattr(os, 'add_dll_directory'):
        os.add_dll_directory(vsp_root)

# ИМПОРТИРУЕМ ИМЕННО vsp (так как файл называется vsp.py)
import vsp

print(f"Загружен файл: {vsp.__file__}")

print("Очистка рабочей среды...")
vsp.VSPRenew()

print("Создание тестового фюзеляжа...")
fuse_id = vsp.AddGeom('FUSELAGE', '')

print(f"УСПЕХ! Геометрия создана. ID объекта: {fuse_id}")