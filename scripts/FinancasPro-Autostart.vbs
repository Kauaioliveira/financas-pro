Set WshShell = CreateObject("WScript.Shell")
' Roda o .bat escondido (sem abrir janela preta)
WshShell.Run """" & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\FinancasPro.bat""", 0
