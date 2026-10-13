Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir
WshShell.Run chr(34) & "C:\Users\Dharmendra Pal Singh\AppData\Local\Python\bin\python.exe" & chr(34) & " tunnel_launcher.py", 0, False
