{
  "name": "netball-coach-iphone",
  "version": "0.2.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "npx expo start",
    "ios": "npx expo start --ios",
    "prestart": "node -e \"try{require('fs').statSync('node_modules');}catch(e){console.log('Run npm install first.')}\""
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-native-community/datetimepicker": "8.4.4",
    "@react-native-community/netinfo": "11.4.1",
    "@react-navigation/native": "^7.1.34",
    "@react-navigation/native-stack": "^7.14.6",
    "@supabase/supabase-js": "^2.99.1",
    "base-64": "^1.0.0",
    "expo": "~54.0.33",
    "expo-checkbox": "~5.0.8",
    "expo-file-system": "~19.0.21",
    "expo-image-picker": "~17.0.10",
    "expo-mail-composer": "~15.0.8",
    "expo-screen-orientation": "~9.0.8",
    "expo-sqlite": "~16.0.10",
    "expo-updates": "~29.0.16",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-webview": "13.15.0"
  },
  "devDependencies": {
    "@types/react": "~19.1.10",
    "typescript": "^5.4.0"
  }
}
