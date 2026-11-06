# Audio

`year-review-they-say.m4a`: "They Say" by Pipo & Wowa, from Unminus (https://www.unminus.com), under the Unminus
License (free for commercial and personal use, no attribution required). Genre Acoustic, mood Relaxed, 93 BPM.

Made from the 2:37 MP3 Mark downloaded (6.4 MB, 329 kbps) as AAC 96 kbps (1.9 MB) for phones. About 1.1 s of
silence at the end; the player crossfades the loop over the last 2.5 s.

Used only by the service year in review (js/review.js). It is not part of the app download: the page fetches it the
first time the music is turned on and keeps it in the `gw-audio` cache, which the service worker leaves alone.
