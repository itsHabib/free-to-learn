"""Diagrams for the Bell films. Coordinates are authored for a portrait phone frame."""
from functools import lru_cache
from math import comb, cos, pi, sin
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 720, 900
INK = "#102B30"
DEEP = "#092126"
PAPER = "#F8F1DD"
SAND = "#E2D8B9"
FAINT = "#B8CBC5"
TEAL = "#72E4BE"
DARK_TEAL = "#075748"
RED = "#F48666"
DARK_RED = "#963F2E"
GRID = "#355653"
FONT_ROOT = Path("/System/Library/Fonts/Supplemental")
FONT = {"body": "Arial.ttf", "bold": "Arial Bold.ttf", "serif": "Georgia.ttf",
        "italic": "Georgia Italic.ttf", "code": "Courier New Bold.ttf"}


@lru_cache(maxsize=None)
def face(style, size):
    return ImageFont.truetype(str(FONT_ROOT / FONT[style]), size)


def mark(d, xy, words, size=30, color=PAPER, style="body", anchor="lm"):
    d.text(xy, words, font=face(style, size), anchor=anchor, fill=color)


def rule(d, x0, y, x1, color=GRID, width=2):
    d.line((x0, y, x1, y), fill=color, width=width)


def paper(d, bounds, color=PAPER):
    x0, y0, x1, y1 = bounds
    d.rounded_rectangle((x0+4, y0+8, x1+4, y1+8), radius=16, fill=DEEP)
    d.rounded_rectangle(bounds, radius=16, fill=color)


def heading(d, title, tag):
    mark(d, (40, 52), "FREE TO LEARN", 23, TEAL, "code")
    mark(d, (680, 52), "QUANTUM LINK LAB", 23, FAINT, "code", "rm")
    rule(d, 40, 84, 680)
    mark(d, (40, 125), tag.upper(), 22, FAINT, "code")
    mark(d, (40, 188), title, 50, PAPER, "serif")


def footer(d, first, second):
    rule(d, 40, 731, 680)
    mark(d, (40, 778), first, 30, PAPER, "bold")
    mark(d, (40, 824), second, 27, FAINT)


def intro(d, time, rooms):
    for i, (x, who, lab) in enumerate(((53, "ALICE", "x"), (386, "BOB", "y"))):
        drop = int(24 * max(0, 1 - (time - i*.18)/.65))
        y = 298 - drop
        paper(d, (x, y, x+279, y+326))
        mark(d, (x+21, y+40), who, 25, DARK_TEAL, "code")
        mark(d, (x+140, y+154), lab, 112, INK, "italic", "mm")
        rule(d, x+24, y+233, x+254, SAND, 3)
        mark(d, (x+140, y+277), "0 or 1", 34, INK, "code", "mm")
    for y in range(305, 630, 24):
        d.line((359, y, 359, y+10), fill=FAINT, width=3)
    if rooms:
        mark(d, (360, 671), "Each sees one card.", 31, TEAL, "bold", "mm")


def deals(d, mode, time):
    pairs = ("0  0","0  1","1  0","1  1")
    for i, pair in enumerate(pairs):
        x = 47 + (i % 2) * 322
        y = 262 + (i // 2) * 201
        paper(d, (x, y, x+298, y+176))
        mark(d, (x+23, y+32), "DEAL", 21, DARK_TEAL, "code")
        mark(d, (x+273,y+32), pair, 26, INK, "code", "rm")
        rule(d, x+21, y+62, x+276, SAND)
        write = mode not in ("rules", "guess")
        is_move = mode == "moved" or (mode == "change" and time >= 1.8)
        is_loss = i == (2 if is_move else 3)
        if write and (time >= .12*i or mode in ("change", "moved")):
            a = int(is_move and i >= 2)
            mark(d, (x+22,y+102), f"Answer {a}, 0", 28, INK, "bold")
            if is_loss:
                d.line((x+24, y+137, x+40, y+153), fill=DARK_RED, width=4)
                d.line((x+40, y+137, x+24, y+153), fill=DARK_RED, width=4)
            else:
                d.line((x+22, y+145, x+29, y+152, x+43, y+133), fill=DARK_TEAL, width=4)
            mark(d, (x+52,y+145), "LOSS" if is_loss else "WIN", 25,
                 DARK_RED if is_loss else DARK_TEAL, "bold")
        else:
            mark(d, (x+22,y+102), "Different" if i == 3 else "Match", 34, INK, "serif")
            mark(d, (x+22,y+145), "required answers", 21, DARK_TEAL)
    if mode == "guess":
        mark(d, (360, 681), "Both always answer 0.", 34, TEAL, "bold", "mm")


def chain(d, level, time):
    # Going round the chain gives B1 = A0 = B0 = A1; the fourth edge wants B1 ≠ A1.
    points = [(153,353),(551,353),(551,600),(153,600)]
    edges = [(1,2,1),(0,1,2),(2,3,2),(3,0,3)]
    for a,b,needed in edges:
        x,y=points[a]; xx,yy=points[b]
        ratio = 1 if needed<level else min(1,time/.9) if needed==level else 0
        if ratio:
            d.line((x,y,int(x+(xx-x)*ratio),int(y+(yy-y)*ratio)),fill=RED if needed==3 else TEAL,width=11)
        else:
            d.line((x,y,xx,yy),fill=GRID,width=3)
    for left,top,step,text in ((551,477,1,"="),(352,353,2,"="),(352,600,2,"="),(153,477,3,"≠")):
        d.ellipse((left-25,top-25,left+25,top+25),fill=INK)
        mark(d,(left,top-2),text if level>=step else "?",40,
             (RED if step==3 else TEAL) if level>=step else FAINT, "bold","mm")
    for (x,y),name in zip(points,("B1","A0","B0","A1")):
        d.ellipse((x-48,y-48,x+48,y+48),fill=PAPER)
        mark(d,(x,y),name,40,INK,"code","mm")
    mark(d,(360,677),"A0 = Alice’s answer when dealt 0",25,FAINT,"body","mm")


def compare_rates(d, quantum):
    for i,(caption,num,color) in enumerate((("Best local plan",.75,TEAL),("Ideal entangled pair",.853553,RED))):
        if i and not quantum:
            break
        y=330+i*155
        mark(d,(55,y),caption,32,PAPER,"bold")
        mark(d,(665,y),f"{num*100:.1f}%",35,color,"code","rm")
        d.rounded_rectangle((55,y+39,665,y+76),12,fill=GRID)
        d.rounded_rectangle((55,y+39,int(55+610*num),y+76),12,fill=color)
    if not quantum:
        mark(d,(360,553),"3 winning deals / 4",45,PAPER,"serif","mm")


def axes(d,time):
    # Angles are Bloch-sphere measurement axes in the real X–Z plane for Phi+.
    for x,name,angles,color in ((185,"Alice",(0,90),TEAL),(535,"Bob",(45,-45),RED)):
        cy,r=465,124
        d.ellipse((x-r,cy-r,x+r,cy+r),outline=GRID,width=3)
        d.line((x-r,cy,x+r,cy),fill=GRID,width=2)
        d.line((x,cy-r,x,cy+r),fill=GRID,width=2)
        for i,angle in enumerate(angles):
            if time < i*.45: continue
            a=angle*pi/180; end=(x+sin(a)*(r-18),cy-cos(a)*(r-18))
            d.line((x,cy,*end),fill=color,width=6)
            ex,ey=end
            d.ellipse((ex-18,ey-18,ex+18,ey+18),fill=color)
            mark(d,(ex,ey),str(i),23,INK,"bold","mm")
        mark(d,(x,288),name,34,PAPER,"serif","mm")
        mark(d,(x,635),"0°  /  90°" if name=="Alice" else "+45°  /  −45°",28,color,"code","mm")


def scorecards(d,time):
    for i,(fraction,caption,color) in enumerate((("8 / 10","EXAMPLE RUN",TEAL),("196 / 245","DELFT RECORD",RED))):
        y=282+i*195
        paper(d,(49,y,671,y+164))
        mark(d,(73,y+42),caption,23,DARK_TEAL,"code")
        mark(d,(73,y+108),fraction,45,INK,"serif")
        if time>.3+i*.3:
            mark(d,(641,y+102),"80%",49,DARK_TEAL if i==0 else DARK_RED,"bold","rm")


def distribution(d,n,tail,time):
    low,high,k=(0,10,8) if n==10 else (151,215,196)
    probabilities=[comb(n,i)*.75**i*.25**(n-i) for i in range(low,high+1)]
    highest=max(probabilities); base=582; left=65; right=660
    step=(right-left)/len(probabilities); height=212
    mark(d,(55,290),"Chance of each win count",29,FAINT,"body")
    for index,p in enumerate(probabilities):
        i=index+low
        h=round(p/highest*height*min(1,time/.8+.04))
        if not h: continue
        x=left+index*step
        color=RED if tail and i>=k else TEAL if not tail else GRID
        d.rectangle((int(x+1),base-h,int(x+step-1),base),fill=color)
    rule(d,left,base+2,right,FAINT,2)
    ticks=(0,5,8,10) if n==10 else (151,184,196,215)
    for v in ticks:
        x=left+(v-low+.5)*step
        d.line((x,base+3,x,base+13),fill=FAINT,width=2)
        mark(d,(x,base+38),str(v),24,RED if tail and v==k else PAPER,"code","mm")
    mark(d,(360,679),"Wins in a fixed-length run",25,FAINT,"body","mm")


def pile(d, time, erased):
    # Grouped totals deliberately omit time order.
    y=347; cols=35
    for i in range(245):
        x=56+(i%cols)*17.8; yy=y+(i//cols)*29
        if i<196:
            d.ellipse((x,yy,x+11,yy+11),fill=TEAL)
        elif not erased:
            d.rectangle((x,yy,x+10,yy+10),fill=RED)
        else:
            d.rectangle((x,yy,x+10,yy+10),outline=GRID,width=1)
    mark(d,(56,291),"Counted trials, grouped by outcome",28,PAPER,"body")
    mark(d,(56,588),"196 wins",33,TEAL,"bold")
    mark(d,(664,588),"49 erased" if erased else "49 losses",33,RED,"bold","rm")
    if erased:
        mark(d,(360,666),"196 / 196  =  100%",36,PAPER,"code","mm")


def stations(d,detail):
    mark(d,(360,285),"DELFT  /  2015",25,FAINT,"code","mm")
    for x,lbl,col in ((139,"A",TEAL),(581,"B",RED)):
        d.ellipse((x-52,407,x+52,511),fill=col)
        mark(d,(x,457),lbl,46,INK,"bold","mm")
        mark(d,(x,550),"spin",28,PAPER,"body","mm")
    d.line((193,459,525,459),fill=FAINT,width=3)
    mark(d,(360,425),"1.3 km",40,PAPER,"serif","mm")
    if detail:
        mark(d,(360,634),"Timing   •   Settings   •   Trial rule",27,FAINT,"body","mm")
    else:
        mark(d,(360,634),"Two electron spins",31,FAINT,"body","mm")


# Heading, context marker, explanation below the diagram, and reading cue.
SCENES = {
 "deal":("One private card","The Bell game","Each receives a random bit.","Their answers are bits, too."),
 "rooms":("Two separate rooms","The Bell game","Agree on a plan before the deal.","The answers are sent separately."),
 "rules":("What earns a point?","The referee","Four equally likely deals.","Only a pair of ones needs different answers."),
 "guess":("Find the losing deal","Your prediction","Which deal will score zero points?","Pause here and choose a pair of cards."),
 "turn":("The fourth card","Always answer zero","Three wins and one loss.","The last deal required different answers."),
 "change":("Change one answer","A revised plan","Alice now copies her own card.","Bob still answers zero."),
 "moved":("The loss moves","A revised plan","The 1, 1 deal is repaired.","The 1, 0 deal breaks."),
 "chain1":("Connect the answers","Why every local plan loses somewhere","A0 and B0 must match.","An edge joins two required answers."),
 "chain2":("Follow the path","Why every local plan loses somewhere","Three deals require equality.","Trace one continuous path from B1 to A1."),
 "chain3":("Close the loop","Why every local plan loses somewhere","The path makes B1 and A1 equal.","The last deal requires them to differ."),
 "limit":("A ceiling on averages","Independent fair cards","Each deal has probability ¼.","An individual run can still win every trial."),
 "axes":("Let the card pick an axis","Ideal entangled pair","Each station measures its own qubit.","Numbers on the axes are the local input bits."),
 "quantum":("Compare the two logs","Ideal theory • expected win rates","With these axes, the ideal rate is 85.4%.","A single station sees random bits."),
 "compare":("Which eighty percent?","The Bell record","Two records with the same fraction.","Compare them as fixed-length runs."),
 "choose":("Which eighty percent?","Your prediction","Which result is harder for a local plan?","Pick the run before looking at the odds."),
 "ten":("Ten deals","Local model • theoretical distribution","Each deal wins with probability ¾.","The horizontal axis counts wins."),
 "tenTail":("Eight wins or more","Local model • theoretical distribution","The highlighted bars add up to 52.6%.","Eight out of ten is ordinary for this plan."),
 "long":("245 deals","Local model • theoretical distribution","The average moves to 183.75 wins.","The plot shows the central range of counts."),
 "longTail":("196 wins or more","Local model • theoretical distribution","The highlighted tail totals 3.91%.","Same 80% win rate. Different evidence."),
 "paper":("The hardware record","Hensen and colleagues • 2015","The team recorded 196 wins in 245 trials.","The recording came from real hardware."),
 "meaning":("Read the tail","Under the fair-input local model","P(196 or more wins) ≈ 0.0391.","The calculation assumes the local plan."),
 "erase":("Lose the losses?","A deliberate reporting error","Which total will the filter report?","Pause and think about the denominator."),
 "erased":("A perfect-looking log","A deliberate reporting error","49 outcomes disappeared after scoring.","Fix the trial rule before you collect the data."),
 "audit":("What a log can tell you","Reading a Bell experiment","The file gives counts. The setup matters.","Check the methods before interpreting the score."),
}


def frame_image(scene, seconds):
    return draw_scene(scene, min(round(seconds,3),2.25))


@lru_cache(maxsize=3)
def draw_scene(scene,time):
    image=Image.new("RGB",(WIDTH,HEIGHT),INK); d=ImageDraw.Draw(image)
    title,tag,a,b=SCENES[scene]
    heading(d,title,tag)
    if scene in ("deal","rooms"): intro(d,time,scene=="rooms")
    elif scene in ("rules","guess","turn","change","moved"): deals(d,scene,time)
    elif scene.startswith("chain"): chain(d,int(scene[-1]),time)
    elif scene in ("limit","quantum"): compare_rates(d,scene=="quantum")
    elif scene=="axes": axes(d,time)
    elif scene in ("compare","choose"): scorecards(d,time)
    elif scene in ("ten","tenTail","long","longTail","meaning"):
        distribution(d,10 if scene.startswith("ten") else 245,scene in ("tenTail","longTail","meaning"),time)
    elif scene in ("paper","audit"): stations(d,scene=="audit")
    else: pile(d,time,scene=="erased")
    footer(d,a,b)
    return image
