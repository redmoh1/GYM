# Gym Management System (Desktop)

Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø³Ø·Ø­ Ù…ÙƒØªØ¨ Ø§Ø­ØªØ±Ø§ÙÙŠ Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ø´ØªØ±Ø§ÙƒØ§Øª Ù‚Ø§Ø¹Ø© Ø±ÙŠØ§Ø¶ÙŠØ© Ø¨Ø§Ø³ØªØ®Ø¯Ø§Ù…:
- Python
- PySide6
- SQLite

## ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹

1. Ø¥Ù†Ø´Ø§Ø¡ Ø¨ÙŠØ¦Ø© Ø§ÙØªØ±Ø§Ø¶ÙŠØ© (Ø§Ø®ØªÙŠØ§Ø±ÙŠ Ù„ÙƒÙ† Ù…ÙÙØ¶Ù‘ÙŽÙ„):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. ØªØ«Ø¨ÙŠØª Ø§Ù„Ù…ØªØ·Ù„Ø¨Ø§Øª:
```powershell
pip install -r requirements.txt
```

3. ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬:
```powershell
python main.py
```

## ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬ Ø¥Ù„Ù‰ EXE

1. ØªØ«Ø¨ÙŠØª PyInstaller:
```powershell
pip install pyinstaller
```

2. Ø¨Ù†Ø§Ø¡ Ù…Ù„Ù exe:
```powershell
pyinstaller --noconfirm --onefile --windowed --name GymManager main.py
```

3. Ø³ØªØ¬Ø¯ Ø§Ù„Ù…Ù„Ù Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ ÙÙŠ:
- `dist/GymManager.exe`

## Ù‡ÙŠÙƒÙ„ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹

- `main.py`: Ù†Ù‚Ø·Ø© ØªØ´ØºÙŠÙ„ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚
- `database.py`: Ù…Ù†Ø·Ù‚ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ÙˆØ§Ù„Ø­Ø³Ø§Ø¨Ø§Øª
- `ui/main_window.py`: Ø§Ù„Ø´Ø§Ø´Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© ÙˆØ§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª ÙˆØ§Ù„Ø¬Ø¯Ø§ÙˆÙ„
- `ui/member_dialog.py`: Ø´Ø§Ø´Ø© Ø¥Ø¶Ø§ÙØ©/ØªØ¹Ø¯ÙŠÙ„ Ù„Ø§Ø¹Ø¨
- `ui/styles.py`: ØªÙ†Ø³ÙŠÙ‚ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø©
