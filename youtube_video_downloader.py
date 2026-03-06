import yt_dlp # A powerful YouTube/video downloader module.
import tkinter as tk # Python GUI library.
from tkinter import filedialog # Opens a system folder selection window.

root = tk.Tk() # creates a hidden Tkinter window.
root.withdraw() # hides it because you only want the folder-selection dialog, not a full GUI window.

'''
askdirectory() opens a dialog box to choose folder.
If user clicks Cancel, download_folder becomes empty → program stops using exit().
'''
download_folder = filedialog.askdirectory(title="Select Download Folder")
if not download_folder:
    print("No folder Selected!")
    exit()
    
print('Select Download Quality : ')
print("1. Best Quality")
print('2. Audo only')
print("3. Custom Format (720p or 1080p)")

quality_choice = input("Enter your choice (1,2,3): ")

ydl_opts= {
    "outtmpl" : f"{download_folder}/%(title)s.%(ext)s",
}
'''
outtmpl sets output filename pattern:
%(title)s → video title
%(ext)s → file extension
This saves the video inside the selected folder.
'''

if quality_choice == "1":
    ydl_opts["format"] = "best"
elif quality_choice == "2":
    ydl_opts["format"] = "bestaudio"
elif quality_choice == "3":
    custom_format = input("Enter Custom Format (e.g) - 1080p or 720p")
    ydl_opts["format"] = f"bestvideo[height<={custom_format}] + bestaudio/best"
else:
    print("Invalid choice . Defaulting to best quality.")
    ydl_opts["format"] = "best"
    
url = input('enter video url: ')

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download([url])
'''
A YoutubeDL downloader is created with your settings (ydl_opts).
It downloads the video at the given URL.
NOTE : - URL is passed as a list ([url]) because yt-dlp supports downloading multiple URLs at once
'''

print(f"Video Downloaded Successfully to {download_folder}")