// Keeps Metro (the JS bundler) away from the Python folders (venvs, datasets, weights).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const escape = (p) => p.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
const pythonDirs = ['backend', 'ai'].map((dir) => new RegExp(`^${escape(path.join(__dirname, dir))}[/\\\\].*`));
const existing = config.resolver.blockList;

config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...pythonDirs];

module.exports = config;
