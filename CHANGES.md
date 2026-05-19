{
  "expo": {
    "name": "Netball Coach",
    "slug": "netball-coach-iphone",
    "version": "0.2.0",
    "sdkVersion": "54.0.0",
    "orientation": "default",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSPhotoLibraryUsageDescription": "Allow selecting player photos."
      }
    },
    "plugins": [
      "expo-sqlite",
      "expo-mail-composer",
      "@react-native-community/datetimepicker"
    ],
    "extra": {
      "eas": {
        "projectId": "54a21062-487d-4a62-96fb-cb34551a2e00"
      }
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "updates": {
      "url": "https://u.expo.dev/54a21062-487d-4a62-96fb-cb34551a2e00"
    },
    "android": {}
  }
}
