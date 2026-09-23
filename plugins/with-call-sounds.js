const { withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withCallSounds(config) {
  config = withMainApplication(config, value => {
    if (!value.modResults.contents.includes('add(CallSoundsPackage())')) {
      value.modResults.contents = value.modResults.contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n          add(CallSoundsPackage())',
      );
      if (!value.modResults.contents.includes('add(CallSoundsPackage())'))
        throw new Error('Could not register CallSoundsPackage in MainApplication');
    }
    return value;
  });
  return withDangerousMod(config, ['android', async value => {
    const packageName = value.android?.package;
    if (!packageName) throw new Error('Android package is required for call sounds');
    const source = await fs.readFile(path.join(value.modRequest.projectRoot, 'native/CallSoundsPackage.kt'), 'utf8');
    const target = path.join(value.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    await fs.mkdir(target, {recursive: true});
    await fs.writeFile(path.join(target, 'CallSoundsPackage.kt'), source.replace('package com.anonymous.aasaitalk', `package ${packageName}`));
    return value;
  }]);
};
