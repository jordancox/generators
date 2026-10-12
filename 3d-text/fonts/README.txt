Typeface JSON for three.js, converted from these fonts with tools/ttf2typeface.py.
Each JSON keeps the font's own copyright line in "original_font_information".

times.json          Liberation Serif Regular   SIL Open Font License 1.1 (OFL-1.1.txt), from Ubuntu's fonts-liberation.
                                               "Liberation" is a Reserved Font Name, so the converted copy is
                                               called "Serif" (--name), as the OFL asks of modified versions.
times-bold.json     Liberation Serif Bold      the same, renamed "Serif Bold"
archivo-black.json  Archivo Black              SIL Open Font License 1.1, github.com/google/fonts ofl/archivoblack
anton.json          Anton                      SIL Open Font License 1.1, github.com/google/fonts ofl/anton
comic-neue.json     Comic Neue Bold            SIL Open Font License 1.1, github.com/google/fonts ofl/comicneue
pacifico.json       Pacifico                   SIL Open Font License 1.1, github.com/google/fonts ofl/pacifico
gothic.json         Grenze Gotisch at wght 700 SIL Open Font License 1.1, github.com/google/fonts ofl/grenzegotisch
luckiest-guy.json   Luckiest Guy               Apache License 2.0 (Apache-2.0.txt), github.com/google/fonts apache/luckiestguy

To add a font: python3 tools/ttf2typeface.py Some.ttf fonts/some.json, then add it to FONTS in app.js.
Check its licence for a Reserved Font Name first; if it has one, pass --name with a different name.
