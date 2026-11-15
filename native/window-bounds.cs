using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
class WindowBounds {
  [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;}
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref Point p);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  static string Kind(string name){
    if(name=="LeagueClientUx")return "league-client";
    if(name=="League of Legends")return "league-game";
    if(name=="VALORANT-Win64-Shipping")return "valorant";
    return null;
  }
  static string Bounds(IntPtr h,string kind){
    Rect r;Point p=new Point();
    if(h==IntPtr.Zero||IsIconic(h)||!IsWindowVisible(h)||!GetClientRect(h,out r)||!ClientToScreen(h,ref p)||r.Right<=0||r.Bottom<=0)return "null";
    return "{\"kind\":\""+kind+"\",\"x\":"+p.X+",\"y\":"+p.Y+",\"width\":"+r.Right+",\"height\":"+r.Bottom+"}";
  }
  static string Current(){
    try{IntPtr h=GetForegroundWindow();uint pid;GetWindowThreadProcessId(h,out pid);using(Process p=Process.GetProcessById((int)pid)){string kind=Kind(p.ProcessName);return kind==null?"null":Bounds(h,kind);}}catch{return "null";}
  }
  static void Main(string[] args){
    try{SetThreadDpiAwarenessContext(new IntPtr(-4));}catch{}
    if(args.Length>0&&args[0]=="--inspect"){
      foreach(Process p in Process.GetProcesses()){using(p){try{string kind=Kind(p.ProcessName);if(kind!=null)Console.WriteLine(Bounds(p.MainWindowHandle,kind));}catch{}}}return;
    }
    Thread parentPipe=new Thread(delegate(){try{Console.In.ReadLine();}catch{}Environment.Exit(0);});parentPipe.IsBackground=true;parentPipe.Start();
    string last="";
    while(true){string current=Current();if(current!=last){try{Console.WriteLine(current);Console.Out.Flush();}catch{return;}last=current;}Thread.Sleep(100);}
  }
}
