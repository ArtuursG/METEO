# Contributing to prognoze.lv

Thanks for your interest in improving the project.

## Project structure

Plain HTML/CSS/JavaScript, no framework, no build step — see the
[Architecture section](README.md#architecture) in the README for a file-by-file
breakdown and key implementation notes.

## Local setup

```bash
git clone https://github.com/ArtuursG/METEO.git
cd METEO
# Open with Live Server (VS Code) or any local static server
```

A local server is required — opening `index.html` directly via `file://` will
block API requests due to CORS.

## Making changes

1. Fork the repo and create a branch for your change.
2. Keep changes focused — one feature or fix per pull request.
3. Test manually in a browser (light/dark theme, mobile width, at least one
   city search and one geolocation load) before opening a PR.
4. Open a pull request describing what changed and why.

## Reporting bugs / suggesting features

Please [open an issue](https://github.com/ArtuursG/METEO/issues) with steps to
reproduce (for bugs) or a clear description of the use case (for feature
requests).

## Security issues

Please don't open a public issue for security vulnerabilities — see
[SECURITY.md](SECURITY.md) instead.
