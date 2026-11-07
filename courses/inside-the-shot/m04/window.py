"""Worked example: count to absolute end; unrelated to trail layout."""
def take_window(raw,start,count):
    if start<0 or count<0 or start+count>len(raw): raise ValueError('window bounds')
    end=start+count
    return raw[start:end]
def contains_pair(values):
    return any(a=='A' and b=='Z' for a,b in zip(values,values[1:]))
if __name__=='__main__':
    print(take_window(b'abcXY',3,2))
    for candidate in ['pAZq','AZq','AZ','A','Z']:
        print(repr(candidate),contains_pair(candidate))
