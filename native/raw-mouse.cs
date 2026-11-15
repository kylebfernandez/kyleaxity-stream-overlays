using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
class RawMouseReader:NativeWindow,IDisposable {
  [StructLayout(LayoutKind.Sequential)] struct Device {public ushort Page,Usage;public uint Flags;public IntPtr Target;}
  [StructLayout(LayoutKind.Sequential)] struct Header {public uint Type,Size;public IntPtr Device,Param;}
  [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterRawInputDevices(Device[] devices,uint count,uint size);
  [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr input,uint command,IntPtr data,ref uint size,uint headerSize);
  readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();long dx,dy,wheel;
  static bool Decode(IntPtr data,uint size,out int x,out int y){x=y=0;int header=Marshal.SizeOf(typeof(Header));if(size<header+24||Marshal.ReadInt32(data)!=0)return false;int flags=Marshal.ReadInt16(data,header)&0xffff;if((flags&1)!=0)return false;x=Marshal.ReadInt32(data,header+12);y=Marshal.ReadInt32(data,header+16);return x!=0||y!=0;}
  static int WheelDelta(IntPtr data,uint size){int header=Marshal.SizeOf(typeof(Header));if(size<header+24||Marshal.ReadInt32(data)!=0)return 0;return (Marshal.ReadInt16(data,header+4)&0x400)!=0?Marshal.ReadInt16(data,header+6):0;}
  public RawMouseReader(){
    CreateHandle(new CreateParams{Caption="Local overlay mouse input",Parent=new IntPtr(-3)});
    // Passive mouse input sink. Does not suppress legacy input or capture/modify game input.
    if(!RegisterRawInputDevices(new Device[]{new Device{Page=1,Usage=2,Flags=0x100,Target=Handle}},1,(uint)Marshal.SizeOf(typeof(Device))))throw new Exception("Raw mouse registration failed");
    timer.Interval=8;timer.Tick+=delegate{if(dx!=0||dy!=0||wheel!=0){Console.WriteLine("{\"dx\":"+dx+",\"dy\":"+dy+",\"wheel\":"+wheel+"}");dx=dy=wheel=0;}};timer.Start();Console.WriteLine("{\"ready\":true}");
  }
  protected override void WndProc(ref Message message){
    if(message.Msg==0xff){uint size=0,header=(uint)Marshal.SizeOf(typeof(Header));GetRawInputData(message.LParam,0x10000003,IntPtr.Zero,ref size,header);if(size>=header+24&&size<=4096){IntPtr buffer=Marshal.AllocHGlobal((int)size);try{if(GetRawInputData(message.LParam,0x10000003,buffer,ref size,header)==size){int x,y;if(Decode(buffer,size,out x,out y)){dx+=x;dy+=y;}wheel+=WheelDelta(buffer,size);}}finally{Marshal.FreeHGlobal(buffer);}}}
    base.WndProc(ref message);
  }
  public void Dispose(){timer.Dispose();DestroyHandle();}
  static void SelfTest(){int header=Marshal.SizeOf(typeof(Header));IntPtr buffer=Marshal.AllocHGlobal(header+24);try{for(int i=0;i<header+24;i++)Marshal.WriteByte(buffer,i,0);Marshal.WriteInt32(buffer,header+12,-1800);Marshal.WriteInt32(buffer,header+16,560);int x,y;if(!Decode(buffer,(uint)(header+24),out x,out y)||x!=-1800||y!=560)throw new Exception("Relative delta decoding failed");Marshal.WriteInt16(buffer,header,1);if(Decode(buffer,(uint)(header+24),out x,out y))throw new Exception("Absolute input must not be treated as relative");Marshal.WriteInt16(buffer,header+4,0x400);Marshal.WriteInt16(buffer,header+6,120);if(WheelDelta(buffer,(uint)(header+24))!=120)throw new Exception("Wheel up decoding failed");Marshal.WriteInt16(buffer,header+6,-120);if(WheelDelta(buffer,(uint)(header+24))!=-120)throw new Exception("Wheel down decoding failed");Marshal.WriteInt16(buffer,header+4,0x800);if(WheelDelta(buffer,(uint)(header+24))!=0)throw new Exception("Horizontal wheel must not light vertical arrows");Console.WriteLine("PASS: raw movement and up/down wheel deltas; horizontal scroll excluded");}finally{Marshal.FreeHGlobal(buffer);}}
  [STAThread] static void Main(string[] args){if(args.Length>0&&args[0]=="--self-test"){SelfTest();return;}Thread parent=new Thread(delegate(){try{Console.In.ReadLine();}catch{}Environment.Exit(0);});parent.IsBackground=true;parent.Start();using(var reader=new RawMouseReader()){Application.Run(new ApplicationContext());}}
}
