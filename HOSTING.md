# Putting Groundwork on your phone (free)

1. Make a free GitHub account, create a new repository (Public is fine; the app has no data in it. Your records live only on your phone).
2. Upload everything in this folder (index.html, sw.js, manifest.webmanifest, css/, js/, icons/) to the repository root.
3. Repository Settings > Pages > Deploy from a branch > main / (root) > Save. After a minute you get a link like https://yourname.github.io/reponame/
4. Android: open the link in Chrome > menu > Install app. iPhone: open in Safari > Share > Add to Home Screen.
5. Open it once with signal; after that it works offline.

Updating: when you change any file, edit CACHE in sw.js (rvapp-v1 -> rvapp-v2) so phones pick up the new version.
Back up regularly: Settings > Data > Backup. Your data does not move between different web addresses except through backup/restore.
