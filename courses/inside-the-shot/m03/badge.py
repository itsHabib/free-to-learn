"""Different tiny worked format; this is not the trail solution."""
def decode_badge(raw):
    if len(raw)<2 or raw[0:1]!=b'B': raise ValueError('badge header')
    count=raw[1]
    if count>4 or len(raw)!=2+count: raise ValueError('badge length')
    return [int.from_bytes(raw[i:i+1],'little',signed=True) for i in range(2,len(raw))]
if __name__=='__main__':
    print(decode_badge(b'B\x02\x7f\xfe'))
