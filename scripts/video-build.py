"""Assembles the main product film from the real screen recording, real stills and the
three generated assets in deliverables/video/assets (narration, music, one abstract insert).

Usage:  python scripts/video-build.py
Needs:  pip install imageio-ffmpeg pillow
The interface is never generated: every product scene is the captured application.
"""
import json, os, subprocess, sys, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
CAP = ROOT / 'deliverables' / 'captures'
VID = ROOT / 'deliverables' / 'video'
AS = VID / 'assets'
TMP = VID / '.build'
TMP.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
REC = CAP / 'ASTER_product_capture_SIM-11_seed11_1080p.webm'
W, H, FPS = 1920, 1080, 30
LEAD = 1.0  # narration starts one second into the film
FONT = 'C:/Windows/Fonts/segoeui.ttf'
FONT_B = 'C:/Windows/Fonts/seguisb.ttf'
INK, CYAN, AMBER, PANEL = (232, 240, 246), (102, 213, 232), (245, 195, 107), (11, 16, 22)
TAG = 'Research prototype · Simulated data'


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size)


def overlay(name, line=None, label=None, tag=TAG, words=None, lockup=False):
    """Transparent 1920x1080 PNG with the on-screen line, its label and the persistent tag."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if lockup:
        im = Image.new('RGBA', (W, H), PANEL + (255,))
        d = ImageDraw.Draw(im)
        d.text((W / 2, 400), 'ASTER', font=font(150, True), fill=INK, anchor='mm')
        d.line((W / 2 - 150, 500, W / 2 + 150, 500), fill=CYAN, width=3)
        d.text((W / 2, 560), 'Space Health Research Console', font=font(44), fill=INK, anchor='mm')
        d.text((W / 2, 690), 'github.com/umitcancinar/NasaSpaceApps', font=font(34), fill=CYAN, anchor='mm')
        d.text((W / 2, 900), 'Research prototype · Simulated data · Not a medical device', font=font(28), fill=(159, 176, 190), anchor='mm')
        d.text((W / 2, 950), 'Built with Claude Fable 5.2 · Narration, music and one illustrative insert generated with Higgsfield', font=font(24), fill=(159, 176, 190), anchor='mm')
        im.save(TMP / f'{name}.png')
        return TMP / f'{name}.png'
    if tag:
        f = font(24)
        tw = d.textlength(tag, font=f)
        d.rounded_rectangle((W - tw - 76, 36, W - 36, 86), 10, fill=PANEL + (225,), outline=(60, 80, 96, 255))
        d.text((W - tw - 56, 61), tag, font=f, fill=AMBER, anchor='lm')
    if line:
        f, fl = font(50, True), font(26)
        tw = max(d.textlength(line, font=f), d.textlength(label or '', font=fl))
        top = H - (190 if label else 150)
        d.rounded_rectangle((56, top, 56 + tw + 72, H - 56), 14, fill=PANEL + (232,), outline=(60, 80, 96, 255))
        d.rectangle((56, top + 14, 61, H - 70), fill=CYAN)
        d.text((92, top + 48), line, font=f, fill=INK, anchor='lm')
        if label:
            d.text((92, top + 98), label, font=fl, fill=CYAN, anchor='lm')
    if words:
        f = font(76, True)
        x = 150
        for w in words:
            d.text((x, H - 230), w, font=f, fill=INK, anchor='lm')
            x += d.textlength(w, font=f) + 70
        d.text((150, H - 150), 'Illustration · AI-generated footage, not the product', font=font(26), fill=CYAN, anchor='lm')
    im.save(TMP / f'{name}.png')
    return TMP / f'{name}.png'


def run(args):
    r = subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])


ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', FPS, '-an']


def rec(name, start, src_len, dur, png, crop=None):
    """A stretch of the real recording, retimed to fill `dur` seconds."""
    k = dur / src_len
    c = f'crop={crop},' if crop else ''
    vf = f'[0:v]{c}scale={W}:{H}:flags=lanczos,setpts={k:.5f}*PTS,fps={FPS}[v];[v][1:v]overlay=0:0[o]'
    out = TMP / f'{name}.mp4'
    run(['-ss', start, '-t', src_len, '-i', REC, '-loop', '1', '-i', png, '-filter_complex', vf, '-map', '[o]', '-t', f'{dur:.3f}', *ENC, out])
    return out


def still(name, image, dur, png):
    """A real product still with a slow push-in."""
    n = int(dur * FPS)
    vf = (f"[0:v]scale={W * 2}:{H * 2}:flags=lanczos,zoompan=z='1+0.00035*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v];"
          f'[v][1:v]overlay=0:0[o]')
    out = TMP / f'{name}.mp4'
    run(['-i', CAP / image, '-loop', '1', '-i', png, '-filter_complex', vf, '-map', '[o]', '-frames:v', n, *ENC, out])
    return out


def insert(name, dur, pngs_at):
    """The generated abstract clip, slowed with motion interpolation; words appear in turn."""
    k = dur / 4.0
    chain = f"[0:v]setpts={k:.5f}*PTS,minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:vsbmc=1,scale={W}:{H}:flags=lanczos,eq=brightness=-0.03[v0]"
    ins = ['-i', AS / 'insert_A1_veo3_1_lite.mp4']
    for i, (png, t) in enumerate(pngs_at):
        ins += ['-loop', '1', '-i', png]
        chain += f";[v{i}][{i + 1}:v]overlay=0:0:enable='gte(t,{t:.2f})'[v{i + 1}]"
    out = TMP / f'{name}.mp4'
    run([*ins, '-filter_complex', chain, '-map', f'[v{len(pngs_at)}]', '-t', f'{dur:.3f}', *ENC, out])
    return out


def card(name, dur, png):
    out = TMP / f'{name}.mp4'
    run(['-loop', '1', '-i', png, '-vf', f'fps={FPS},format=yuv420p', '-t', f'{dur:.3f}', *ENC, out])
    return out


# Sentence starts in the narration track (seconds), measured from its pauses.
N = dict(open=0.2, env=4.72, body=7.19, meas=9.25, meet=12.36, breath=19.07, sensor=31.73, exercise=47.49,
         event=58.09, ground=64.79, lab=78.33, close=87.89, end=99.82)
T = {k: v + LEAD for k, v in N.items()}
T['open'] = 0.0
cuts = [('open', 'env'), ('env', 'meet'), ('meet', 'breath'), ('breath', 'sensor'), ('sensor', 'exercise'),
        ('exercise', 'event'), ('event', 'ground'), ('ground', 'lab'), ('lab', 'close')]
D = {a: T[b] - T[a] for a, b in cuts}
ACC = 'Simulated data · accelerated simulation'
segs = []

segs.append(rec('s01', 29.6, 5.6, D['open'], overlay('o01', 'What changed?', 'Simulated data'), crop='1152:648:96:330'))
e, b, m = T['env'], T['body'], T['meas']
segs.append(insert('s02', D['env'], [
    (overlay('o02a', tag=None, words=['Environment.']), 0.15),
    (overlay('o02b', tag=None, words=['Environment.', 'Body.']), b - e),
    (overlay('o02c', tag=None, words=['Environment.', 'Body.', 'Measurement.']), m - e)]))
segs.append(rec('s03', 1.7, 6.6, D['meet'], overlay('o03', 'ASTER · Space Health Research Console', 'Research prototype')))
segs.append(rec('s04', 16.6, 8.8, D['breath'], overlay('o04', 'Align the measurement with the breath.', 'Experimental estimate · ' + ACC)))
segs.append(rec('s05', 25.4, 10.0, D['sensor'], overlay('o05', 'Check the connection.', ACC)))
segs.append(rec('s06a', 35.7, 5.8, D['exercise'] - 4.2, overlay('o06a', 'Compare like with like.', 'Experimental estimate · ' + ACC)))
segs.append(still('s06b', 'exercise-matched-dark.png', 4.2, overlay('o06b', 'Compare like with like.', 'Experimental estimate · scenario SIM-08, matched load')))
segs.append(rec('s07', 43.4, 6.0, D['event'], overlay('o07', 'Every interpretation has a reason.', 'Illustrative workflow, not a validated procedure')))
segs.append(rec('s08', 49.8, 16.8, D['ground'], overlay('o08', 'Local continuity. Ground review.', 'Simulated link · accelerated simulation')))
segs.append(rec('s09a', 67.9, 5.4, D['lab'] - 4.2, overlay('o09a', 'Reproducible scenarios. Visible limits.', 'Seeded scenarios')))
segs.append(still('s09b', 'lab-evaluation-dark.png', 4.2, overlay('o09b', 'Reproducible scenarios. Visible limits.', 'Held-out simulation · hidden reference shown to researchers only')))
segs.append(rec('s10a', 8.6, 6.0, 6.2, overlay('o10a', 'Evidence. Uncertainty. Next research step.', ACC)))
segs.append(card('s10b', 8.3, overlay('o10b', lockup=True)))

lst = TMP / 'list.txt'
lst.write_text(''.join(f"file '{p.as_posix()}'\n" for p in segs))
silent = TMP / 'silent.mp4'
run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent])
total = sum(D.values()) + 6.2 + 8.3

out = VID / 'ASTER_Product_Film_EN_1080p.mp4'
af = (f'[1:a]aresample=48000,adelay={int(LEAD * 1000)}:all=1,alimiter=limit=0.89,apad[n];'
      f'[2:a]aresample=48000,aloop=loop=3:size={45 * 48000},afade=t=in:d=1.5,volume=0.11,atrim=0:{total:.2f},afade=t=out:st={total - 3:.2f}:d=3[m];'
      f'[n][m]amix=inputs=2:duration=shortest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{total:.2f}[a]')
run(['-i', silent, '-i', AS / 'narration_qwen_alistair.mp3', '-i', AS / 'music_elevenlabs_v2.mp3', '-filter_complex',
     af + f';[0:v]fade=t=in:d=0.5,fade=t=out:st={total - 0.8:.2f}:d=0.8[v]', '-map', '[v]', '-map', '[a]',
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', FPS, '-c:a', 'aac', '-b:a', '192k',
     '-ar', '48000', '-movflags', '+faststart', '-t', f'{total:.2f}', out])
run(['-ss', '24', '-i', out, '-frames:v', '1', VID / 'poster-main.png'])

# Captions from the measured sentence starts.
CAPS = [(0.2, 4.6, 'In space, a changing signal can tell more than one story.'), (4.72, 7.1, 'The environment may have changed.'),
        (7.19, 9.2, 'The body may be responding.'), (9.25, 12.2, 'Or the sensor may have lost reliable contact.'),
        (12.36, 18.9, 'Meet ASTER: an offline-capable research console that brings those possibilities into view.'),
        (19.07, 25.6, 'Breathing and Exposure aligns local carbon dioxide measurements with the respiratory cycle.'),
        (25.78, 31.6, 'It explores what the crew member may be inhaling, while showing the limits of the estimate.'),
        (31.73, 35.9, 'Sensor Integrity checks the quality of the measurement connection.'),
        (36.05, 47.3, 'When contact becomes unreliable, ASTER marks the affected interpretation instead of presenting uncertain data as a confident conclusion.'),
        (47.49, 57.9, 'Exercise and Muscle Response compares similar activity under similar loads, with mechanical signals and fluid-sensitive measurements kept in context.'),
        (58.09, 64.6, 'Each event connects observations, quality checks, and versioned rules to an inspectable explanation.'),
        (64.79, 69.1, 'When the ground link is unavailable, the case remains accessible locally.'),
        (69.26, 78.2, 'When communication resumes, its evidence can be delivered and reviewed, with replies linked to the correct revision.'),
        (78.33, 87.7, 'A reproducible simulation lab lets researchers challenge these methods with noise, missing data, and conflicting signals.'),
        (87.89, 93.3, 'ASTER is a research prototype, demonstrated with simulated data.'),
        (93.42, 99.8, 'Its purpose is to make the evidence, the uncertainty, and the next research step visible.')]


def ts(t, sep):
    t += LEAD
    return f'{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d}{sep}{int(round(t % 1 * 1000)) % 1000:03d}'


(VID / 'captions').mkdir(exist_ok=True)
(VID / 'captions' / 'ASTER_Product_Film_EN.srt').write_text(''.join(f"{i}\n{ts(a, ',')} --> {ts(b, ',')}\n{t}\n\n" for i, (a, b, t) in enumerate(CAPS, 1)), encoding='utf-8')
(VID / 'captions' / 'ASTER_Product_Film_EN.vtt').write_text('WEBVTT\n\n' + ''.join(f"{ts(a, '.')} --> {ts(b, '.')}\n{t}\n\n" for a, b, t in CAPS), encoding='utf-8')
print(json.dumps({'file': out.name, 'seconds': round(total, 2), 'bytes': os.path.getsize(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest()}))
