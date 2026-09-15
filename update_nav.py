import os
import sys

path = 'public/museum-street/index.html'

try:
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    orig_c = c
    c = c.replace('space-y-3', 'space-y-2')
    c = c.replace('p-4 flex items-center gap-4', 'p-2 flex items-center gap-3')
    c = c.replace('w-12 h-12', 'w-10 h-10')
    c = c.replace('<h2 class=\"font-bold', '<h2 class=\"text-sm font-bold')

    if c != orig_c:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        print("Updated successfully.")
    else:
        print("No changes made.")

except Exception as e:
    print(f"Error: {e}")
