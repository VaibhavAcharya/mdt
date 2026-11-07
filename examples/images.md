# Images

In Kitty, Ghostty, iTerm2 or WezTerm you see real images. Other terminals, and tmux, get colored half blocks. Images only draw at full resolution when they fit on screen, so scroll until each one is fully visible.

## PNG gradient

![Gradient](images/gradient.png)

## JPEG photo-like scene

![Sunset](images/sunset.jpg)

## Transparent PNG

The corners are transparent and should show the background. Toggle `t` to see it on both themes.

![Transparent circle](images/transparent.png)

## Checkerboard

Sharp edges show the sampling quality of the half-block fallback.

![Checkerboard](images/checker.png)

## Tall image

Capped in height so it does not take over the screen.

![Tall stripes](images/tall.png)

## Wide image

Scaled down to the content width.

![Wide band](images/wide.png)

## Remote image

Fetched over HTTPS in the background, shown as "loading" first.

![Remote gradient](https://raw.githubusercontent.com/VaibhavAcharya/mdt/main/examples/images/gradient.png)

## HTML image tag

<img src="images/checker.png" alt="From an img tag" width="100">

## Linked image

[![Click to open](images/gradient.png)](https://github.com/VaibhavAcharya/mdt)

## Inline image in text

Text before ![tiny](images/checker.png) and after shows a placeholder link instead.

## Broken image

![This file does not exist](images/missing.png)
