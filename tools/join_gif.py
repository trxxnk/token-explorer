"""Join single-frame GIFs into one looping animation. Pure standard library: image data is copied as is.

Usage: join_gif.py frame1.gif:DELAY frame2.gif:DELAY ... out.gif   (DELAY in 1/100 s)
Frames can be made from screenshots with macOS sips:  sips -s format gif shot.jpg --out frame1.gif
"""
import struct, sys
def parse(path):
    b = open(path, 'rb').read()
    assert b[:6] in (b'GIF87a', b'GIF89a'), path
    w, h, flags = struct.unpack('<HHB', b[6:11]); pos = 13
    gct = b''
    if flags & 0x80:
        n = 3 * (2 << (flags & 7)); gct = b[pos:pos + n]; pos += n
    while True:
        c = b[pos]
        if c == 0x21:                                   # extension: skip
            pos += 2
            while b[pos]: pos += b[pos] + 1
            pos += 1
        elif c == 0x2C:
            x, y, iw, ih, f = struct.unpack('<HHHHB', b[pos + 1:pos + 10]); pos += 10
            table = gct
            if f & 0x80:
                n = 3 * (2 << (f & 7)); table = b[pos:pos + n]; pos += n
            start = pos; pos += 1                       # LZW minimum code size
            while b[pos]: pos += b[pos] + 1
            pos += 1
            return w, h, (x, y, iw, ih, f & 0x40), table, b[start:pos]
        else:
            raise ValueError('no image in ' + path)
frames, out = sys.argv[1:-1], sys.argv[-1]
res = bytearray()
for k, spec in enumerate(frames):
    path, delay = spec.rsplit(':', 1)
    w, h, (x, y, iw, ih, interlace), table, data = parse(path)
    if k == 0:
        res += b'GIF89a' + struct.pack('<HHBBB', w, h, 0x70, 0, 0)
        res += b'\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00'          # loop forever
    bits = max(1, (len(table) // 3 - 1).bit_length()) - 1
    table = table.ljust(3 * (2 << bits), b'\0')
    res += b'\x21\xF9\x04\x04' + struct.pack('<H', int(delay)) + b'\x00\x00'   # delay in 1/100 s, keep frame
    res += b'\x2C' + struct.pack('<HHHHB', x, y, iw, ih, 0x80 | interlace | bits) + table + data
res += b'\x3B'
open(out, 'wb').write(res)
print(out, len(frames), 'frames', round(len(res) / 1e6, 2), 'MB')
