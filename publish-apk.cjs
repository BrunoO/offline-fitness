#!/usr/bin/env node
/* eslint-env node */
/* global console, process */

// const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Where the built APK is copied to. Set APK_PUBLISH_DIR to your own folder.
const GOOGLE_DRIVE_PATH = process.env.APK_PUBLISH_DIR ?? '';
const LOCAL_APK_PATH = './android/app/build/outputs/apk/release/app-release.apk';

async function publishAPK() {
  try {
    console.log('🚀 Starting APK  publish process...');

    // // Step 1: Run the local build script
    // console.log('📱 Building APK locally...');
    // execSync('npm run build:local', {
    //   encoding: 'utf8',
    //   stdio: 'inherit'
    // });

    // Step 2: Check if APK was created
    if (!fs.existsSync(LOCAL_APK_PATH)) {
      throw new Error(`APK not found at expected location: ${LOCAL_APK_PATH}`);
    }

    console.log('✅ Local build completed successfully');

    // Step 3: Read app.json to get version info
    const appJsonPath = './app.json';
    if (!fs.existsSync(appJsonPath)) {
      throw new Error('app.json not found');
    }

    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const appVersion = appJson.expo.version || '1.0.0';

    // Step 4: Try to get version code from Android build.gradle
    let versionCode = 'unknown';
    const buildGradlePath = './android/app/build.gradle';
    if (fs.existsSync(buildGradlePath)) {
      const buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
      const versionCodeMatch = buildGradleContent.match(/versionCode\s+(\d+)/);
      if (versionCodeMatch) {
        versionCode = versionCodeMatch[1];
      }
    }

    console.log(`📊 Version: ${appVersion}, Version Code: ${versionCode}`);

    // Step 5: Create destination filename with version code
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `OfflineFitness-v${appVersion}-${versionCode}-${timestamp}.apk`;
    if (!GOOGLE_DRIVE_PATH) {
      throw new Error('Set APK_PUBLISH_DIR to the folder the APK should be copied to');
    }
    const destinationPath = path.join(GOOGLE_DRIVE_PATH, filename);

    // Step 6: Copy APK to the destination folder
    console.log(`📁 Copying APK to ${GOOGLE_DRIVE_PATH}...`);
    console.log(`   Source: ${LOCAL_APK_PATH}`);
    console.log(`   Destination: ${destinationPath}`);

    // Ensure the destination directory exists
    if (!fs.existsSync(GOOGLE_DRIVE_PATH)) {
      console.log(`📁 Creating directory: ${GOOGLE_DRIVE_PATH}`);
      fs.mkdirSync(GOOGLE_DRIVE_PATH, { recursive: true });
    }

    // Copy the file
    fs.copyFileSync(LOCAL_APK_PATH, destinationPath);

    console.log('✅ APK successfully published!');
    console.log(`📱 File: ${filename}`);
    console.log(`📁 Location: ${GOOGLE_DRIVE_PATH}`);
    console.log(`📱 Local APK: ${LOCAL_APK_PATH}`);
  } catch (error) {
    console.error('❌ Error during APK publish process:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the script
publishAPK();
