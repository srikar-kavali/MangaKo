const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude the extractor folder from bundling
config.watchFolders = (config.watchFolders || []).filter(
    f => !f.includes('extractor')
);

config.resolver.blockList = [
    /extractor\/.*/,
];

module.exports = config;