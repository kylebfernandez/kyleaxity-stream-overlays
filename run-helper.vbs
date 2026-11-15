Option Explicit
Dim shell, files, folder, nodePath, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count > 0 Then
  nodePath = WScript.Arguments(0)
Else
  nodePath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
End If
shell.CurrentDirectory = folder
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & folder & "\server.cjs" & Chr(34)
Do
  result = shell.Run(command, 0, True)
  WScript.Sleep 2000
Loop
