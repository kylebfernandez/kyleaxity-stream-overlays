using System;

using System.Collections;

using System.Collections.Generic;

using System.Drawing;

using System.Drawing.Drawing2D;

using System.Drawing.Imaging;

using System.IO;

using System.Net;

using System.Runtime.InteropServices;

using System.Threading;

using System.Web.Script.Serialization;

using System.Windows.Forms;

class DesktopOverlay : Form {

  [StructLayout(LayoutKind.Sequential)] struct Pt {public int X,Y;public Pt(int x,int y){X=x;Y=y;}}

  [StructLayout(LayoutKind.Sequential)] struct Sz {public int Width,Height;public Sz(int w,int h){Width=w;Height=h;}}

  [StructLayout(LayoutKind.Sequential,Pack=1)] struct Blend {public byte Op,Flags,Alpha,Format;}

  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);

  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h,IntPtr dc);

  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);

  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);

  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);

  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);

  [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr h,IntPtr dc,ref Pt dst,ref Sz size,IntPtr src,ref Pt origin,int key,ref Blend blend,int flags);

  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);

  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);

  const int ExtendedStyles=0x80000|0x20|0x80|0x08000000;

  protected override CreateParams CreateParams {get {CreateParams p=base.CreateParams;p.ExStyle|=ExtendedStyles;return p;}}

  protected override bool ShowWithoutActivation {get{return true;}}

  class TracePoint {public float X,Y;public long Time;public TracePoint From;public int Button;}

  readonly List<TracePoint> points=new List<TracePoint>(),clicks=new List<TracePoint>();

  TracePoint previous;Dictionary<string,object> summary;

  Rectangle gameBounds=Rectangle.Empty,lastLeagueBounds=Rectangle.Empty;

  bool enabled=true,desktopEnabled=true;string currentKind="";bool closing=false;

  readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();

  long lastFrame=0;

  void ReportVisibility(bool visible){try{File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"desktop-status.json"),"{\"visible\":"+(visible?"true":"false")+",\"clickThrough\":true,\"noActivate\":true,\"updatedAt\":"+Now()+"}");}catch{}}

  static long Now(){return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}

  static string Field(Dictionary<string,object> d,string key,string fallback=""){object v;return d!=null&&d.TryGetValue(key,out v)&&v!=null?Convert.ToString(v):fallback;}

  static double Number(Dictionary<string,object>d,string key,double fallback=0){object v;return d!=null&&d.TryGetValue(key,out v)&&v!=null?Convert.ToDouble(v):fallback;}

  void ClearTrail(){points.Clear();clicks.Clear();previous=null;}

  void SetBoundsData(object obj){

    var d=obj as Dictionary<string,object>;currentKind=Field(d,"kind");

    if(d!=null&&currentKind.StartsWith("league")){gameBounds=new Rectangle((int)Number(d,"x"),(int)Number(d,"y"),(int)Number(d,"width"),(int)Number(d,"height"));lastLeagueBounds=gameBounds;}

    else gameBounds=Rectangle.Empty;

    ClearTrail();

  }

  void Accept(string json){

    var items=new JavaScriptSerializer().DeserializeObject(json) as object[];if(items==null)return;

    foreach(object item in items){var d=item as Dictionary<string,object>;string kind=Field(d,"kind");

      if(kind=="desktop-state"){

        enabled=Field(d,"enabled","True").ToLower()=="true";desktopEnabled=Field(d,"desktopEnabled","True").ToLower()=="true";

        if(d.ContainsKey("bounds"))SetBoundsData(d["bounds"]);if(d.ContainsKey("summary"))summary=d["summary"] as Dictionary<string,object>;if(!enabled)ClearTrail();continue;

      }

      if(kind=="bounds"){SetBoundsData(d.ContainsKey("bounds")?d["bounds"]:null);continue;}

      if(kind=="summary"){summary=d.ContainsKey("summary")?d["summary"] as Dictionary<string,object>:null;continue;}

      if(kind=="leave"){ClearTrail();continue;}

      if(!enabled||!desktopEnabled||gameBounds.IsEmpty)continue;

      if(kind!="move"&&kind!="click")continue;

      var p=new TracePoint{X=gameBounds.X+(float)Number(d,"x")*gameBounds.Width/1920f,Y=gameBounds.Y+(float)Number(d,"y")*gameBounds.Height/1080f,Time=Now(),Button=(int)Number(d,"button")};

      if(kind=="click")clicks.Add(p);else{p.From=previous;previous=p;points.Add(p);}

    }

  }

  void Listen(){

    while(!closing){

      try{

        HttpWebRequest request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:17843/desktop-events");request.Timeout=5000;request.ReadWriteTimeout=30000;request.Proxy=null;

        using(WebResponse response=request.GetResponse())using(StreamReader reader=new StreamReader(response.GetResponseStream())){

          string line;while(!closing&&(line=reader.ReadLine())!=null){if(!line.StartsWith("data: "))continue;string data=line.Substring(6);BeginInvoke((Action)(()=>{try{Accept(data);}catch{}}));}

        }

      }catch{}

      if(!closing){try{BeginInvoke((Action)(()=>{ClearTrail();summary=null;}));}catch{}Thread.Sleep(2000);}

    }

  }

  public DesktopOverlay(bool connect){

    FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;Text="League stream companion";

    var handle=Handle;

    if(connect){timer.Interval=33;timer.Tick+=(s,e)=>{try{Frame();}catch(Exception error){try{File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"desktop-error.txt"),error.Message);}catch{}Environment.Exit(1);}};timer.Start();Thread worker=new Thread(Listen);worker.IsBackground=true;worker.Start();}

  }

  bool HasSummary(long now){return summary!=null&&Field(summary,"game")=="league"&&Number(summary,"expiresAt")>now;}

  Rectangle SummaryRect(){Rectangle area=lastLeagueBounds.IsEmpty?Screen.PrimaryScreen.WorkingArea:lastLeagueBounds;int width=Math.Min(1160,Math.Max(600,area.Width-48));int height=(int)(486*width/1160f);return new Rectangle(area.X+(area.Width-width)/2,area.Bottom-height-52,width,height);}

  Rectangle ContentRect(bool showSummary){

    RectangleF area=RectangleF.Empty;

    foreach(var p in points){if(p.From!=null){var r=RectangleF.FromLTRB(Math.Min(p.X,p.From.X)-14,Math.Min(p.Y,p.From.Y)-14,Math.Max(p.X,p.From.X)+14,Math.Max(p.Y,p.From.Y)+14);area=area.IsEmpty?r:RectangleF.Union(area,r);}}

    foreach(var p in clicks){var r=new RectangleF(p.X-28,p.Y-28,56,56);area=area.IsEmpty?r:RectangleF.Union(area,r);}

    if(showSummary){var r=SummaryRect();area=area.IsEmpty?r:RectangleF.Union(area,r);}

    return area.IsEmpty?Rectangle.Empty:Rectangle.Ceiling(area);

  }

  void Frame(){

    long now=Now();points.RemoveAll(p=>now-p.Time>500);clicks.RemoveAll(p=>now-p.Time>500);

    bool showSummary=desktopEnabled&&HasSummary(now);

    if(!desktopEnabled){ClearTrail();if(Visible){Hide();ReportVisibility(false);}return;}

    Rectangle region=ContentRect(showSummary);if(region.IsEmpty){if(Visible){Hide();ReportVisibility(false);}return;}

    // An idle summary does not need 30 redraws per second.

    if(points.Count==0&&clicks.Count==0&&now-lastFrame<500)return;

    lastFrame=now;

    using(Bitmap bitmap=new Bitmap(region.Width,region.Height,PixelFormat.Format32bppArgb)){

      using(Graphics g=Graphics.FromImage(bitmap)){g.SmoothingMode=SmoothingMode.AntiAlias;g.Clear(Color.Transparent);g.TranslateTransform(-region.X,-region.Y);Draw(g,now,showSummary);}

      Present(bitmap,region);

    }

  }

  void Draw(Graphics g,long now,bool showSummary){

    foreach(var p in points){if(p.From==null||p.Time-p.From.Time>180)continue;float a=Math.Max(0,1-(now-p.Time)/500f);float width=.3f+2.1f*(float)Math.Pow(a,.65);

      using(Pen glow=new Pen(Color.FromArgb((int)(a*30),245,243,236),width+5)){glow.StartCap=glow.EndCap=LineCap.Round;g.DrawLine(glow,p.From.X,p.From.Y,p.X,p.Y);}

      using(Pen pen=new Pen(Color.FromArgb((int)(a*255),245,243,236),width)){pen.StartCap=pen.EndCap=LineCap.Round;g.DrawLine(pen,p.From.X,p.From.Y,p.X,p.Y);}

    }

    foreach(var p in clicks){float age=(now-p.Time)/500f,a=Math.Max(0,1-age),r=.5f*(12+age*30);Color c=p.Button==2?Color.FromArgb(212,219,112):Color.FromArgb(15,91,204);

      using(Pen outline=new Pen(Color.FromArgb((int)(a*230),7,9,16),3))g.DrawEllipse(outline,p.X-r,p.Y-r,r*2,r*2);

      using(Pen pen=new Pen(Color.FromArgb((int)(a*255),c),1.5f))g.DrawEllipse(pen,p.X-r,p.Y-r,r*2,r*2);

    }

    if(showSummary)DrawSummary(g,SummaryRect());

  }

  static void Label(Graphics g,string text,float size,FontStyle weight,Color color,RectangleF rect,StringAlignment align){using(Font font=new Font("Segoe UI",size,weight,GraphicsUnit.Pixel))using(Brush brush=new SolidBrush(color))using(StringFormat format=new StringFormat()){format.Alignment=align;format.LineAlignment=StringAlignment.Center;format.Trimming=StringTrimming.EllipsisCharacter;format.FormatFlags=StringFormatFlags.NoWrap;g.DrawString(text,font,brush,rect,format);}}

  void DrawSummary(Graphics g,Rectangle r){

    float scale=r.Width/1160f;var saved=g.Save();g.TranslateTransform(r.X,r.Y);g.ScaleTransform(scale,scale);

    using(Brush bg=new SolidBrush(Color.FromArgb(248,7,23,29)))g.FillRectangle(bg,0,0,1160,r.Height/scale);

    using(Pen border=new Pen(Color.FromArgb(210,146,123,69)))g.DrawRectangle(border,0,0,1159,(r.Height-1)/scale);

    string champion=Field(summary,"champion");Label(g,(champion.Length>0?champion+" · ":"")+"LEAGUE OF LEGENDS",24,FontStyle.Bold,Color.White,new RectangleF(24,16,780,35),StringAlignment.Near);

    Label(g,Field(summary,"preview")=="True"?"PREVIEW · SAMPLE DATA":"POST-GAME INPUT SUMMARY"+(Field(summary,"partial")=="True"?" · PARTIAL CAPTURE":""),11,FontStyle.Regular,Color.FromArgb(150,172,168),new RectangleF(24,50,780,21),StringAlignment.Near);

    Label(g,Field(summary,"status","MATCH COMPLETE"),12,FontStyle.Bold,Color.FromArgb(171,239,202),new RectangleF(820,18,310,25),StringAlignment.Far);

    Label(g,Field(summary,"kda"),18,FontStyle.Bold,Color.White,new RectangleF(820,45,310,26),StringAlignment.Far);

    string[] values={Number(summary,"apm").ToString("F1"),(Number(summary,"travelPixels")/1000).ToString("F1")+"k px",summary.ContainsKey("efficiency")&&summary["efficiency"]!=null?Number(summary,"efficiency").ToString("F0")+"%":"—",Number(summary,"clicks").ToString("N0"),Number(summary,"tempoHz").ToString("F1")+" Hz",Number(summary,"idleSeconds").ToString("F0")+"s"};

    string[] labels={"APM","CURSOR TRAVEL","EFFICIENCY","CLICKS","CLICK TEMPO","IDLE"};

    for(int i=0;i<6;i++){float x=24+i*187;using(Brush tile=new SolidBrush(Color.FromArgb(100,25,49,49)))g.FillRectangle(tile,x,84,177,86);Label(g,values[i],26,FontStyle.Bold,Color.White,new RectangleF(x,91,177,38),StringAlignment.Center);Label(g,labels[i],11,FontStyle.Regular,Color.FromArgb(193,170,111),new RectangleF(x,132,177,22),StringAlignment.Center);}

    Label(g,"Measured locally · Clicks and key presses · Cursor path statistics",11,FontStyle.Regular,Color.FromArgb(139,165,163),new RectangleF(24,181,1110,25),StringAlignment.Near);

    object countObject;var keyCounts=summary.TryGetValue("keyCounts",out countObject)?countObject as Dictionary<string,object>:null;

    if(keyCounts!=null){

      string[][] rows={new string[]{"Q","W","E","R","D","F","Ctrl","Shift","Space"},new string[]{"1","2","3","4","5","6","7","V"}};

      for(int row=0;row<rows.Length;row++)for(int i=0;i<rows[row].Length;i++){

        float x=24+i*124,y=214+row*39;

        using(Brush tile=new LinearGradientBrush(new RectangleF(x,y,116,32),Color.FromArgb(24,49,48),Color.FromArgb(10,29,33),90))g.FillRectangle(tile,x,y,116,32);

        using(Pen line=new Pen(Color.FromArgb(100,126,106,59)))g.DrawRectangle(line,x,y,116,32);

        Label(g,rows[row][i].ToUpper(),11,FontStyle.Bold,Color.FromArgb(172,190,183),new RectangleF(x+9,y,56,32),StringAlignment.Near);

        Label(g,Number(keyCounts,rows[row][i]).ToString("N0"),14,FontStyle.Bold,Color.FromArgb(233,213,164),new RectangleF(x+52,y,54,32),StringAlignment.Far);

      }

    }

    Label(g,"MOUSE PATH  /  YELLOW: LEFT · BLUE: RIGHT",10,FontStyle.Bold,Color.FromArgb(193,170,111),new RectangleF(24,294,540,24),StringAlignment.Near);

    Label(g,"ACTIVITY HEATMAP  /  SAMPLED SCREEN COORDINATES",10,FontStyle.Bold,Color.FromArgb(193,170,111),new RectangleF(594,294,540,24),StringAlignment.Near);

    object mapObject;var map=summary.TryGetValue("pointerMap",out mapObject)?mapObject as Dictionary<string,object>:null;

    DrawMap(g,new RectangleF(24,320,540,140),map,false);DrawMap(g,new RectangleF(594,320,540,140),map,true);

    Label(g,"Full match review: 127.0.0.1:17843/review.html",10,FontStyle.Regular,Color.FromArgb(139,165,163),new RectangleF(24,462,1110,18),StringAlignment.Near);

    g.Restore(saved);

  }

  void DrawMap(Graphics g,RectangleF panel,Dictionary<string,object> map,bool heat){

    using(Brush bg=new SolidBrush(Color.FromArgb(8,23,29)))g.FillRectangle(bg,panel);

    using(Pen border=new Pen(Color.FromArgb(100,125,108,65)))g.DrawRectangle(border,panel.X,panel.Y,panel.Width,panel.Height);

    if(map==null){Label(g,"Available after a newly captured match",12,FontStyle.Regular,Color.FromArgb(149,158,142),panel,StringAlignment.Center);return;}

    float width=panel.Height*1920f/1080f;RectangleF plot=new RectangleF(panel.X+(panel.Width-width)/2,panel.Y,width,panel.Height);

    var path=map["path"] as System.Collections.IList;

    if(heat){var values=map["heat"] as System.Collections.IList;double max=1;foreach(object value in values)max=Math.Max(max,Convert.ToDouble(value));for(int i=0;i<values.Count;i++){double value=Convert.ToDouble(values[i]);if(value<=0)continue;double a=Math.Log(1+value)/Math.Log(1+max);using(Brush brush=new SolidBrush(Color.FromArgb((int)(70+180*a),(int)(55+185*a),(int)(130+70*a),65)))g.FillRectangle(brush,plot.X+(i%48)*plot.Width/48,plot.Y+(i/48)*plot.Height/27,plot.Width/48+.3f,plot.Height/27+.3f);}}

    else{

      PointF? previous=null;using(Pen pen=new Pen(Color.FromArgb(85,212,189,121),.6f))foreach(object entry in path){var point=entry as System.Collections.IList;if(point==null)continue;PointF p=new PointF(plot.X+(float)Convert.ToDouble(point[0])/1920*plot.Width,plot.Y+(float)Convert.ToDouble(point[1])/1080*plot.Height);if(previous.HasValue&&Convert.ToInt32(point[2])!=0)g.DrawLine(pen,previous.Value,p);previous=p;}

      foreach(string name in new string[]{"left","right"}){var values=map[name] as System.Collections.IList;using(Brush brush=new SolidBrush(name=="left"?Color.FromArgb(212,219,112):Color.FromArgb(108,184,255)))for(int i=0;i<values.Count;i++)if(Convert.ToDouble(values[i])>0)g.FillEllipse(brush,plot.X+(i%48+.5f)*plot.Width/48-1,plot.Y+(i/48+.5f)*plot.Height/27-1,2,2);}

    }

  }

  void Present(Bitmap bitmap,Rectangle r){

    IntPtr screen=GetDC(IntPtr.Zero),memory=CreateCompatibleDC(screen),image=bitmap.GetHbitmap(Color.FromArgb(0)),old=SelectObject(memory,image);

    try{Pt destination=new Pt(r.X,r.Y),origin=new Pt(0,0);Sz size=new Sz(r.Width,r.Height);Blend blend=new Blend{Op=0,Flags=0,Alpha=255,Format=1};if(!UpdateLayeredWindow(Handle,screen,ref destination,ref size,memory,ref origin,0,ref blend,2))throw new Exception("Windows could not update the transparent overlay.");if(!Visible){Show();ReportVisibility(true);}SetWindowPos(Handle,new IntPtr(-1),0,0,0,0,0x13);}

    finally{SelectObject(memory,old);DeleteObject(image);DeleteDC(memory);ReleaseDC(IntPtr.Zero,screen);}

  }

  protected override void Dispose(bool disposing){closing=true;if(disposing)timer.Dispose();base.Dispose(disposing);}

  [STAThread] static void Main(string[] args){

    try{SetThreadDpiAwarenessContext(new IntPtr(-4));}catch{}

    Application.EnableVisualStyles();

    if(args.Length==2&&args[0]=="--render-preview"){

      using(var overlay=new DesktopOverlay(false))using(Bitmap bitmap=new Bitmap(1200,518,PixelFormat.Format32bppArgb))using(Graphics g=Graphics.FromImage(bitmap)){

        overlay.lastLeagueBounds=new Rectangle(0,0,1200,520);overlay.summary=new Dictionary<string,object>{{"game","league"},{"preview",true},{"apm",212.4},{"travelPixels",308200},{"efficiency",62},{"clicks",3184},{"tempoHz",2.4},{"idleSeconds",12},{"status","SAMPLE SUMMARY"}};

        overlay.summary["keyCounts"]=new Dictionary<string,object>{{"Q",42},{"W",18},{"E",31},{"R",4},{"D",2},{"F",3},{"V",12},{"Space",52},{"Ctrl",6},{"Shift",4}};

        var samplePath=new List<object>();double[] heat=new double[1296],left=new double[1296],right=new double[1296];var random=new Random(42);
        for(int i=0;i<500;i++){double x=Math.Max(0,Math.Min(1919,960+(random.NextDouble()+random.NextDouble()-1)*850)),y=Math.Max(0,Math.Min(1079,540+(random.NextDouble()+random.NextDouble()-1)*500));samplePath.Add(new double[]{x,y,i==0?0:1});int cell=(int)(y/40)*48+(int)(x/40);heat[cell]++;if(i%3==0)left[cell]++;else right[cell]++;}
        overlay.summary["pointerMap"]=new Dictionary<string,object>{{"path",samplePath},{"heat",heat},{"left",left},{"right",right}};
        g.Clear(Color.Transparent);overlay.DrawSummary(g,new Rectangle(20,16,1160,486));bitmap.Save(args[1],ImageFormat.Png);

        if((overlay.CreateParams.ExStyle&ExtendedStyles)!=ExtendedStyles)throw new Exception("Missing click-through/no-activate styles");

      }return;

    }

    using(Mutex single=new Mutex(false,"Local\\LeagueDesktopOverlay")){if(!single.WaitOne(0))return;

      Thread parentPipe=new Thread(delegate(){try{Console.In.ReadLine();}catch{}Environment.Exit(0);});parentPipe.IsBackground=true;parentPipe.Start();

      using(var overlay=new DesktopOverlay(true)){Application.Run(new ApplicationContext());}

    }

  }

}
