# Gym Management System (Desktop)

برنامج سطح مكتب احترافي لإدارة اشتراكات قاعة رياضية باستخدام:
- Python
- PySide6
- SQLite

## تشغيل المشروع

1. إنشاء بيئة افتراضية (اختياري لكن مُفضّل):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. تثبيت المتطلبات:
```powershell
pip install -r requirements.txt
```

3. تشغيل البرنامج:
```powershell
python main.py
```

## تحويل البرنامج إلى EXE

1. تثبيت PyInstaller:
```powershell
pip install pyinstaller
```

2. بناء ملف exe:
```powershell
pyinstaller --noconfirm --onefile --windowed --name GymManager main.py
```

3. ستجد الملف التنفيذي في:
- `dist/GymManager.exe`

## هيكل المشروع

- `main.py`: نقطة تشغيل التطبيق
- `database.py`: منطق قاعدة البيانات والحسابات
- `ui/main_window.py`: الشاشة الرئيسية والتبويبات والجداول
- `ui/member_dialog.py`: شاشة إضافة/تعديل لاعب
- `ui/styles.py`: أدوات تحميل الخط والتنسيق
- `ui/style.qss`: ملف التصميم الموحد