import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

export type AppLanguage = "en" | "ta" | "hi" | "te" | "kn" | "ml" | "bn" | "mr";

export const priorityIndianLanguages = [
  { code: "en", label: "English", nativeLabel: "English", available: true },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", available: true },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", available: true },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", available: true },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", available: true },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", available: true },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", available: true },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", available: true },
] as const;

const storageKey = "aasai-app-language";

// Dynamic content such as member names, bios, and messages stays in the language
// in which it was created. This dictionary intentionally covers app-controlled UI.
const tamil: Record<string, string> = {
  "Explore": "தேடல்",
  "Calls": "அழைப்புகள்",
  "Messages": "செய்திகள்",
  "Wallet": "வாலட்",
  "Settings": "அமைப்புகள்",
  "App language": "பயன்பாட்டு மொழி",
  "Indian languages": "இந்திய மொழிகள்",
  "Default app language": "இயல்புநிலை பயன்பாட்டு மொழி",
  "Choose your app language": "உங்கள் பயன்பாட்டு மொழியைத் தேர்ந்தெடுக்கவும்",
  "Choose how Aasai Talk appears on this device. English is the default.": "இந்த சாதனத்தில் Aasai Talk எப்படித் தோன்ற வேண்டும் என்பதைத் தேர்ந்தெடுக்கவும். இயல்புநிலை மொழி ஆங்கிலம்.",
  "English": "ஆங்கிலம்",
  "Tamil": "தமிழ்",
  "Available": "கிடைக்கிறது",
  "Selected": "தேர்ந்தெடுக்கப்பட்டது",
  "Coming soon": "விரைவில் வருகிறது",
  "More Indian languages": "மேலும் இந்திய மொழிகள்",
  "Hindi, Telugu, Kannada, Malayalam, Bengali and Marathi are planned next. They will appear here when their translations are ready.": "இந்தி, தெலுங்கு, கன்னடம், மலையாளம், பெங்காலி மற்றும் மராத்தி அடுத்ததாக திட்டமிடப்பட்டுள்ளன. மொழிபெயர்ப்புகள் தயாரானதும் இங்கே தோன்றும்.",
  "People to meet": "பேச தயாரானவர்கள்",
  "Search": "தேடுக",
  "Filters": "வடிகட்டிகள்",
  "Available balance": "கிடைக்கும் இருப்பு",
  "AVAILABLE BALANCE": "கிடைக்கும் இருப்பு",
  "Ready for your next conversation": "உங்கள் அடுத்த உரையாடலுக்குத் தயாராக உள்ளது",
  "Choose coins": "நாணயங்களைத் தேர்ந்தெடுக்கவும்",
  "Special offers": "சிறப்பு சலுகைகள்",
  "All coin packs": "அனைத்து நாணய தொகுப்புகள்",
  "Offers": "சலுகைகள்",
  "Activity": "செயல்பாடு",
  "Wallet activity": "வாலட் செயல்பாடு",
  "Secure checkout": "பாதுகாப்பான பணம் செலுத்தல்",
  "Special offers are here": "சிறப்பு சலுகைகள் இங்கே உள்ளன",
  "Notifications": "அறிவிப்புகள்",
  "Notification preferences": "அறிவிப்பு விருப்பங்கள்",
  "Privacy and safety": "தனியுரிமை மற்றும் பாதுகாப்பு",
  "Privacy policy": "தனியுரிமைக் கொள்கை",
  "Terms and conditions": "விதிமுறைகள் மற்றும் நிபந்தனைகள்",
  "Safety center": "பாதுகாப்பு மையம்",
  "Community guidelines": "சமூக வழிகாட்டுதல்கள்",
  "Log out": "வெளியேறு",
  "Delete account": "கணக்கை நீக்கு",
  "Continue": "தொடரவும்",
  "Cancel": "ரத்து",
  "Save": "சேமி",
  "Try again": "மீண்டும் முயற்சிக்கவும்",
  "Back to Explore": "தேடலுக்குத் திரும்பு",
  "Call": "அழைப்பு",
  "Audio": "ஆடியோ",
  "Video": "வீடியோ",
  "Message": "செய்தி",
  "Send": "அனுப்பு",
  "On a call": "அழைப்பில்",
  "Away": "தொலைவில்",
};

const hindi: Record<string, string> = {
  "Explore": "खोजें", "Calls": "कॉल", "Messages": "संदेश", "Wallet": "वॉलेट", "Settings": "सेटिंग्स",
  "App language": "ऐप की भाषा", "Choose your app language": "अपनी ऐप भाषा चुनें",
  "Indian languages": "भारतीय भाषाएँ", "Default app language": "डिफ़ॉल्ट ऐप भाषा",
  "Choose how Aasai Talk appears on this device. English is the default.": "इस डिवाइस पर Aasai Talk की भाषा चुनें। अंग्रेज़ी डिफ़ॉल्ट है।",
  "Available": "उपलब्ध", "Selected": "चुना गया", "People to meet": "बात करने के लिए लोग", "Search": "खोजें", "Filters": "फ़िल्टर",
  "Available balance": "उपलब्ध बैलेंस", "AVAILABLE BALANCE": "उपलब्ध बैलेंस", "Ready for your next conversation": "आपकी अगली बातचीत के लिए तैयार",
  "Choose coins": "कॉइन चुनें", "Special offers": "विशेष ऑफ़र", "All coin packs": "सभी कॉइन पैक", "Offers": "ऑफ़र", "Activity": "गतिविधि",
  "Wallet activity": "वॉलेट गतिविधि", "Secure checkout": "सुरक्षित भुगतान", "Special offers are here": "विशेष ऑफ़र यहाँ हैं",
  "Notifications": "सूचनाएँ", "Notification preferences": "सूचना प्राथमिकताएँ", "Privacy and safety": "गोपनीयता और सुरक्षा",
  "Privacy policy": "गोपनीयता नीति", "Terms and conditions": "नियम और शर्तें", "Safety center": "सुरक्षा केंद्र", "Community guidelines": "समुदाय दिशानिर्देश",
  "Log out": "लॉग आउट", "Delete account": "खाता हटाएँ", "Continue": "जारी रखें", "Cancel": "रद्द करें", "Save": "सहेजें", "Try again": "फिर से कोशिश करें",
  "Back to Explore": "खोज पर वापस", "Call": "कॉल", "Audio": "ऑडियो", "Video": "वीडियो", "Message": "संदेश", "Send": "भेजें", "On a call": "कॉल पर", "Away": "दूर हैं",
};

const telugu: Record<string, string> = {
  "Explore": "అన్వేషించండి", "Calls": "కాల్స్", "Messages": "సందేశాలు", "Wallet": "వాలెట్", "Settings": "సెట్టింగ్‌లు",
  "App language": "యాప్ భాష", "Choose your app language": "మీ యాప్ భాషను ఎంచుకోండి",
  "Indian languages": "భారతీయ భాషలు", "Default app language": "డిఫాల్ట్ యాప్ భాష",
  "Choose how Aasai Talk appears on this device. English is the default.": "ఈ పరికరంలో Aasai Talk ఎలా కనిపించాలో ఎంచుకోండి. ఇంగ్లీష్ డిఫాల్ట్ భాష.",
  "Available": "అందుబాటులో", "Selected": "ఎంచుకున్నది", "People to meet": "మాట్లాడటానికి వ్యక్తులు", "Search": "వెతకండి", "Filters": "ఫిల్టర్లు",
  "Available balance": "అందుబాటులో ఉన్న బ్యాలెన్స్", "AVAILABLE BALANCE": "అందుబాటులో ఉన్న బ్యాలెన్స్", "Ready for your next conversation": "మీ తదుపరి సంభాషణకు సిద్ధంగా ఉంది",
  "Choose coins": "కాయిన్‌లను ఎంచుకోండి", "Special offers": "ప్రత్యేక ఆఫర్లు", "All coin packs": "అన్ని కాయిన్ ప్యాక్‌లు", "Offers": "ఆఫర్లు", "Activity": "కార్యకలాపం",
  "Wallet activity": "వాలెట్ కార్యకలాపం", "Secure checkout": "సురక్షిత చెల్లింపు", "Special offers are here": "ప్రత్యేక ఆఫర్లు ఇక్కడ ఉన్నాయి",
  "Notifications": "నోటిఫికేషన్‌లు", "Notification preferences": "నోటిఫికేషన్ ప్రాధాన్యతలు", "Privacy and safety": "గోప్యత మరియు భద్రత",
  "Privacy policy": "గోప్యతా విధానం", "Terms and conditions": "నిబంధనలు మరియు షరతులు", "Safety center": "భద్రతా కేంద్రం", "Community guidelines": "సమాజ మార్గదర్శకాలు",
  "Log out": "లాగ్ అవుట్", "Delete account": "ఖాతాను తొలగించండి", "Continue": "కొనసాగించండి", "Cancel": "రద్దు చేయండి", "Save": "సేవ్ చేయండి", "Try again": "మళ్లీ ప్రయత్నించండి",
  "Back to Explore": "అన్వేషణకు తిరిగి", "Call": "కాల్", "Audio": "ఆడియో", "Video": "వీడియో", "Message": "సందేశం", "Send": "పంపండి", "On a call": "కాల్‌లో", "Away": "దూరంగా ఉన్నారు",
};

const kannada: Record<string, string> = {
  "Explore": "ಅನ್ವೇಷಿಸಿ", "Calls": "ಕರೆಗಳು", "Messages": "ಸಂದೇಶಗಳು", "Wallet": "ವಾಲೆಟ್", "Settings": "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
  "App language": "ಆ್ಯಪ್ ಭಾಷೆ", "Choose your app language": "ನಿಮ್ಮ ಆ್ಯಪ್ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ",
  "Indian languages": "ಭಾರತೀಯ ಭಾಷೆಗಳು", "Default app language": "ಡೀಫಾಲ್ಟ್ ಆ್ಯಪ್ ಭಾಷೆ",
  "Choose how Aasai Talk appears on this device. English is the default.": "ಈ ಸಾಧನದಲ್ಲಿ Aasai Talk ಹೇಗೆ ಕಾಣಬೇಕೆಂದು ಆಯ್ಕೆಮಾಡಿ. ಇಂಗ್ಲಿಷ್ ಡೀಫಾಲ್ಟ್ ಭಾಷೆಯಾಗಿದೆ.",
  "Available": "ಲಭ್ಯವಿದೆ", "Selected": "ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ", "People to meet": "ಮಾತನಾಡಲು ಜನರು", "Search": "ಹುಡುಕಿ", "Filters": "ಫಿಲ್ಟರ್‌ಗಳು",
  "Available balance": "ಲಭ್ಯವಿರುವ ಬಾಕಿ", "AVAILABLE BALANCE": "ಲಭ್ಯವಿರುವ ಬಾಕಿ", "Ready for your next conversation": "ನಿಮ್ಮ ಮುಂದಿನ ಸಂಭಾಷಣೆಗೆ ಸಿದ್ಧವಾಗಿದೆ",
  "Choose coins": "ನಾಣ್ಯಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ", "Special offers": "ವಿಶೇಷ ಕೊಡುಗೆಗಳು", "All coin packs": "ಎಲ್ಲಾ ನಾಣ್ಯ ಪ್ಯಾಕ್‌ಗಳು", "Offers": "ಕೊಡುಗೆಗಳು", "Activity": "ಚಟುವಟಿಕೆ",
  "Wallet activity": "ವಾಲೆಟ್ ಚಟುವಟಿಕೆ", "Secure checkout": "ಸುರಕ್ಷಿತ ಪಾವತಿ", "Special offers are here": "ವಿಶೇಷ ಕೊಡುಗೆಗಳು ಇಲ್ಲಿವೆ",
  "Notifications": "ಅಧಿಸೂಚನೆಗಳು", "Notification preferences": "ಅಧಿಸೂಚನೆ ಆದ್ಯತೆಗಳು", "Privacy and safety": "ಗೌಪ್ಯತೆ ಮತ್ತು ಸುರಕ್ಷತೆ",
  "Privacy policy": "ಗೌಪ್ಯತಾ ನೀತಿ", "Terms and conditions": "ನಿಯಮಗಳು ಮತ್ತು ಷರತ್ತುಗಳು", "Safety center": "ಸುರಕ್ಷತಾ ಕೇಂದ್ರ", "Community guidelines": "ಸಮುದಾಯ ಮಾರ್ಗಸೂಚಿಗಳು",
  "Log out": "ಲಾಗ್ ಔಟ್", "Delete account": "ಖಾತೆ ಅಳಿಸಿ", "Continue": "ಮುಂದುವರಿಸಿ", "Cancel": "ರದ್ದುಮಾಡಿ", "Save": "ಉಳಿಸಿ", "Try again": "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
  "Back to Explore": "ಅನ್ವೇಷಣೆಗೆ ಹಿಂತಿರುಗಿ", "Call": "ಕರೆ", "Audio": "ಆಡಿಯೋ", "Video": "ವೀಡಿಯೊ", "Message": "ಸಂದೇಶ", "Send": "ಕಳುಹಿಸಿ", "On a call": "ಕರೆಯಲ್ಲಿದ್ದಾರೆ", "Away": "ದೂರದಲ್ಲಿದ್ದಾರೆ",
};

const malayalam: Record<string, string> = {
  "Explore": "പര്യവേക്ഷണം", "Calls": "കോളുകൾ", "Messages": "സന്ദേശങ്ങൾ", "Wallet": "വാലറ്റ്", "Settings": "ക്രമീകരണങ്ങൾ",
  "App language": "ആപ്പ് ഭാഷ", "Choose your app language": "നിങ്ങളുടെ ആപ്പ് ഭാഷ തിരഞ്ഞെടുക്കുക",
  "Indian languages": "ഇന്ത്യൻ ഭാഷകൾ", "Default app language": "സ്ഥിരസ്ഥിതി ആപ്പ് ഭാഷ",
  "Choose how Aasai Talk appears on this device. English is the default.": "ഈ ഉപകരണത്തിൽ Aasai Talk എങ്ങനെ ദൃശ്യമാകണമെന്ന് തിരഞ്ഞെടുക്കുക. ഇംഗ്ലീഷ് സ്ഥിരസ്ഥിതി ഭാഷയാണ്.",
  "Available": "ലഭ്യമാണ്", "Selected": "തിരഞ്ഞെടുത്തു", "People to meet": "സംസാരിക്കാൻ ആളുകൾ", "Search": "തിരയുക", "Filters": "ഫിൽട്ടറുകൾ",
  "Available balance": "ലഭ്യമായ ബാലൻസ്", "AVAILABLE BALANCE": "ലഭ്യമായ ബാലൻസ്", "Ready for your next conversation": "നിങ്ങളുടെ അടുത്ത സംഭാഷണത്തിന് തയ്യാർ",
  "Choose coins": "കോയിനുകൾ തിരഞ്ഞെടുക്കുക", "Special offers": "പ്രത്യേക ഓഫറുകൾ", "All coin packs": "എല്ലാ കോയിൻ പാക്കുകളും", "Offers": "ഓഫറുകൾ", "Activity": "പ്രവർത്തനം",
  "Wallet activity": "വാലറ്റ് പ്രവർത്തനം", "Secure checkout": "സുരക്ഷിത പേയ്മെന്റ്", "Special offers are here": "പ്രത്യേക ഓഫറുകൾ ഇവിടെയുണ്ട്",
  "Notifications": "അറിയിപ്പുകൾ", "Notification preferences": "അറിയിപ്പ് മുൻഗണനകൾ", "Privacy and safety": "സ്വകാര്യതയും സുരക്ഷയും",
  "Privacy policy": "സ്വകാര്യതാ നയം", "Terms and conditions": "നിബന്ധനകളും വ്യവസ്ഥകളും", "Safety center": "സുരക്ഷാ കേന്ദ്രം", "Community guidelines": "കമ്മ്യൂണിറ്റി മാർഗനിർദേശങ്ങൾ",
  "Log out": "ലോഗ് ഔട്ട്", "Delete account": "അക്കൗണ്ട് ഇല്ലാതാക്കുക", "Continue": "തുടരുക", "Cancel": "റദ്ദാക്കുക", "Save": "സേവ് ചെയ്യുക", "Try again": "വീണ്ടും ശ്രമിക്കുക",
  "Back to Explore": "പര്യവേക്ഷണത്തിലേക്ക് മടങ്ങുക", "Call": "കോൾ", "Audio": "ഓഡിയോ", "Video": "വീഡിയോ", "Message": "സന്ദേശം", "Send": "അയയ്ക്കുക", "On a call": "കോളിലാണ്", "Away": "അകലെ",
};

const bengali: Record<string, string> = {
  "Explore": "অন্বেষণ", "Calls": "কল", "Messages": "বার্তা", "Wallet": "ওয়ালেট", "Settings": "সেটিংস",
  "App language": "অ্যাপের ভাষা", "Choose your app language": "আপনার অ্যাপের ভাষা বেছে নিন",
  "Indian languages": "ভারতীয় ভাষা", "Default app language": "ডিফল্ট অ্যাপের ভাষা",
  "Choose how Aasai Talk appears on this device. English is the default.": "এই ডিভাইসে Aasai Talk কীভাবে দেখাবে তা বেছে নিন। ইংরেজি ডিফল্ট ভাষা।",
  "Available": "উপলব্ধ", "Selected": "নির্বাচিত", "People to meet": "কথা বলার মানুষ", "Search": "খুঁজুন", "Filters": "ফিল্টার",
  "Available balance": "উপলব্ধ ব্যালেন্স", "AVAILABLE BALANCE": "উপলব্ধ ব্যালেন্স", "Ready for your next conversation": "আপনার পরবর্তী কথোপকথনের জন্য প্রস্তুত",
  "Choose coins": "কয়েন বেছে নিন", "Special offers": "বিশেষ অফার", "All coin packs": "সব কয়েন প্যাক", "Offers": "অফার", "Activity": "কার্যকলাপ",
  "Wallet activity": "ওয়ালেট কার্যকলাপ", "Secure checkout": "নিরাপদ পেমেন্ট", "Special offers are here": "বিশেষ অফার এখানে আছে",
  "Notifications": "বিজ্ঞপ্তি", "Notification preferences": "বিজ্ঞপ্তির পছন্দ", "Privacy and safety": "গোপনীয়তা ও নিরাপত্তা",
  "Privacy policy": "গোপনীয়তা নীতি", "Terms and conditions": "নিয়ম ও শর্তাবলি", "Safety center": "নিরাপত্তা কেন্দ্র", "Community guidelines": "কমিউনিটি নির্দেশিকা",
  "Log out": "লগ আউট", "Delete account": "অ্যাকাউন্ট মুছুন", "Continue": "চালিয়ে যান", "Cancel": "বাতিল করুন", "Save": "সংরক্ষণ করুন", "Try again": "আবার চেষ্টা করুন",
  "Back to Explore": "অন্বেষণে ফিরে যান", "Call": "কল", "Audio": "অডিও", "Video": "ভিডিও", "Message": "বার্তা", "Send": "পাঠান", "On a call": "কলে আছেন", "Away": "দূরে আছেন",
};

const marathi: Record<string, string> = {
  "Explore": "शोधा", "Calls": "कॉल", "Messages": "संदेश", "Wallet": "वॉलेट", "Settings": "सेटिंग्ज",
  "App language": "अॅपची भाषा", "Choose your app language": "तुमची अॅप भाषा निवडा",
  "Indian languages": "भारतीय भाषा", "Default app language": "डीफॉल्ट अॅप भाषा",
  "Choose how Aasai Talk appears on this device. English is the default.": "या डिव्हाइसवर Aasai Talk कसे दिसेल ते निवडा. इंग्रजी ही डीफॉल्ट भाषा आहे.",
  "Available": "उपलब्ध", "Selected": "निवडलेले", "People to meet": "बोलण्यासाठी लोक", "Search": "शोधा", "Filters": "फिल्टर",
  "Available balance": "उपलब्ध शिल्लक", "AVAILABLE BALANCE": "उपलब्ध शिल्लक", "Ready for your next conversation": "तुमच्या पुढील संभाषणासाठी तयार",
  "Choose coins": "कॉइन्स निवडा", "Special offers": "विशेष ऑफर", "All coin packs": "सर्व कॉइन पॅक", "Offers": "ऑफर", "Activity": "क्रियाकलाप",
  "Wallet activity": "वॉलेट क्रियाकलाप", "Secure checkout": "सुरक्षित पेमेंट", "Special offers are here": "विशेष ऑफर येथे आहेत",
  "Notifications": "सूचना", "Notification preferences": "सूचना प्राधान्ये", "Privacy and safety": "गोपनीयता आणि सुरक्षितता",
  "Privacy policy": "गोपनीयता धोरण", "Terms and conditions": "नियम आणि अटी", "Safety center": "सुरक्षा केंद्र", "Community guidelines": "समुदाय मार्गदर्शक तत्त्वे",
  "Log out": "लॉग आउट", "Delete account": "खाते हटवा", "Continue": "पुढे जा", "Cancel": "रद्द करा", "Save": "जतन करा", "Try again": "पुन्हा प्रयत्न करा",
  "Back to Explore": "शोधाकडे परत", "Call": "कॉल", "Audio": "ऑडिओ", "Video": "व्हिडिओ", "Message": "संदेश", "Send": "पाठवा", "On a call": "कॉलवर", "Away": "दूर आहेत",
};

// Shared product areas must use the same vocabulary across every supported
// language. Keeping these phrases here (rather than inside individual pages)
// prevents a new screen from silently falling back to English.
const hostPayoutTranslations: Record<Exclude<AppLanguage, "en">, Record<string, string>> = {
  ta: {
    "Host earnings": "ஹோஸ்ட் வருமானம்", "Host earnings & withdrawals": "ஹோஸ்ட் வருமானம் மற்றும் பணம் எடுத்தல்", "View available earnings and request a withdrawal.": "கிடைக்கும் வருமானத்தைப் பார்த்து பணம் எடுக்கக் கோருங்கள்.",
    "Become a Host": "ஹோஸ்டாக ஆகுங்கள்", "Host application": "ஹோஸ்ட் விண்ணப்பம்", "YOUR AVAILABLE EARNINGS": "உங்கள் கிடைக்கும் வருமானம்", "Ready for you to withdraw": "பணம் எடுக்கத் தயாராக உள்ளது", "Minimum withdrawal · ₹100": "குறைந்தபட்ச பணம் எடுத்தல் · ₹100", "PAYOUT STATUS": "பணம் பெறும் நிலை", "UPI ID verification": "UPI ID சரிபார்ப்பு", "Bank account verification": "வங்கி கணக்கு சரிபார்ப்பு", "Verified": "சரிபார்க்கப்பட்டது", "In review": "மதிப்பாய்வில்", "Action needed": "நடவடிக்கை தேவை", "Withdrawal requests": "பணம் எடுத்தல் கோரிக்கைகள்", "No requests yet": "இதுவரை கோரிக்கைகள் இல்லை", "Withdraw your earnings": "உங்கள் வருமானத்தை எடுக்கவும்", "Add your payout destination": "பணம் பெறும் விவரங்களைச் சேர்க்கவும்", "Choose a bank account or UPI ID. Your details stay private and must be verified before you can withdraw earnings.": "வங்கி கணக்கு அல்லது UPI ID-ஐத் தேர்ந்தெடுக்கவும். உங்கள் விவரங்கள் தனிப்பட்டவை; வருமானத்தை எடுப்பதற்கு முன் அவை சரிபார்க்கப்படும்.", "Bank account": "வங்கி கணக்கு", "Account holder name": "கணக்கு வைத்திருப்பவர் பெயர்", "Bank account number": "வங்கி கணக்கு எண்", "Re-enter account number": "கணக்கு எண்ணை மீண்டும் உள்ளிடவும்", "IFSC code": "IFSC குறியீடு", "Account numbers do not match.": "கணக்கு எண்கள் பொருந்தவில்லை.", "UPI ID": "UPI ID", "Verification is required": "சரிபார்ப்பு அவசியம்", "Your UPI ID will be checked by our team before your first withdrawal.": "உங்கள் முதல் பணம் எடுத்தலுக்கு முன் எங்கள் குழு உங்கள் UPI ID-ஐச் சரிபார்க்கும்.", "Payout destination verified": "பணம் பெறும் விவரங்கள் சரிபார்க்கப்பட்டன", "Verification pending": "சரிபார்ப்பு நிலுவையில் உள்ளது", "Payout destination under review": "பணம் பெறும் விவரங்கள் மதிப்பாய்வில் உள்ளன", "How much would you like to withdraw?": "எவ்வளவு பணம் எடுக்க விரும்புகிறீர்கள்?", "Enter the amount you want to receive. You can withdraw from ₹100 onwards.": "நீங்கள் பெற விரும்பும் தொகையை உள்ளிடவும். ₹100 முதல் பணம் எடுக்கலாம்.", "How much would you like to withdraw? (₹)": "எவ்வளவு பணம் எடுக்க விரும்புகிறீர்கள்? (₹)", "Example: 500": "உதாரணம்: 500", "What happens next": "அடுத்து என்ன நடக்கும்", "Withdrawal history": "பணம் எடுத்தல் வரலாறு", "Pending": "நிலுவையில்", "Amount sent": "தொகை அனுப்பப்பட்டது", "Change payout destination": "பணம் பெறும் விவரங்களை மாற்றவும்", "Correct payout destination": "பணம் பெறும் விவரங்களைச் சரிசெய்யவும்", "View application status": "விண்ணப்ப நிலையைப் பார்க்கவும்", "Withdrawals unlock after your Host application is approved.": "உங்கள் ஹோஸ்ட் விண்ணப்பம் அங்கீகரிக்கப்பட்ட பிறகு பணம் எடுக்கலாம்.", "Your application is pending review.": "உங்கள் விண்ணப்பம் மதிப்பாய்வில் உள்ளது.", "Saving…": "சேமிக்கப்படுகிறது…", "Sending request…": "கோரிக்கை அனுப்பப்படுகிறது…", "Enter an amount to continue": "தொடர தொகையை உள்ளிடவும்"
  },
  hi: { "Host earnings":"होस्ट कमाई", "Host earnings & withdrawals":"होस्ट कमाई और निकासी", "View available earnings and request a withdrawal.":"उपलब्ध कमाई देखें और निकासी का अनुरोध करें।", "Become a Host":"होस्ट बनें", "Host application":"होस्ट आवेदन", "YOUR AVAILABLE EARNINGS":"आपकी उपलब्ध कमाई", "Ready for you to withdraw":"निकासी के लिए तैयार", "Minimum withdrawal · ₹100":"न्यूनतम निकासी · ₹100", "PAYOUT STATUS":"भुगतान स्थिति", "UPI ID verification":"UPI ID सत्यापन", "Bank account verification":"बैंक खाता सत्यापन", "Verified":"सत्यापित", "In review":"समीक्षा में", "Action needed":"कार्रवाई आवश्यक", "Withdrawal requests":"निकासी अनुरोध", "No requests yet":"अभी कोई अनुरोध नहीं", "Withdraw your earnings":"अपनी कमाई निकालें", "Add your payout destination":"भुगतान विवरण जोड़ें", "Bank account":"बैंक खाता", "Account holder name":"खाताधारक का नाम", "Bank account number":"बैंक खाता नंबर", "Re-enter account number":"खाता नंबर फिर दर्ज करें", "IFSC code":"IFSC कोड", "UPI ID":"UPI ID", "Verification is required":"सत्यापन आवश्यक है", "Verification pending":"सत्यापन लंबित", "Payout destination verified":"भुगतान विवरण सत्यापित", "How much would you like to withdraw?":"आप कितनी राशि निकालना चाहते हैं?", "How much would you like to withdraw? (₹)":"आप कितनी राशि निकालना चाहते हैं? (₹)", "Example: 500":"उदाहरण: 500", "What happens next":"आगे क्या होगा", "Withdrawal history":"निकासी इतिहास", "Pending":"लंबित", "Amount sent":"राशि भेजी गई", "Change payout destination":"भुगतान विवरण बदलें", "Saving…":"सहेजा जा रहा है…", "Sending request…":"अनुरोध भेजा जा रहा है…", "Enter an amount to continue":"आगे बढ़ने के लिए राशि दर्ज करें" },
  te: { "Host earnings":"హోస్ట్ ఆదాయాలు", "Host earnings & withdrawals":"హోస్ట్ ఆదాయాలు మరియు ఉపసంహరణలు", "View available earnings and request a withdrawal.":"అందుబాటులో ఉన్న ఆదాయాలను చూసి ఉపసంహరణను అభ్యర్థించండి.", "Become a Host":"హోస్ట్ అవ్వండి", "Withdrawal requests":"ఉపసంహరణ అభ్యర్థనలు", "No requests yet":"ఇంకా అభ్యర్థనలు లేవు", "Withdraw your earnings":"మీ ఆదాయాలను ఉపసంహరించండి", "Bank account":"బ్యాంక్ ఖాతా", "UPI ID":"UPI ID", "Verified":"ధృవీకరించబడింది", "In review":"సమీక్షలో", "Pending":"పెండింగ్", "Amount sent":"మొత్తం పంపబడింది", "How much would you like to withdraw?":"మీరు ఎంత ఉపసంహరించాలనుకుంటున్నారు?", "Example: 500":"ఉదాహరణ: 500", "Saving…":"సేవ్ అవుతోంది…", "Sending request…":"అభ్యర్థన పంపుతోంది…", "Enter an amount to continue":"కొనసాగడానికి మొత్తాన్ని నమోదు చేయండి" },
  kn: { "Host earnings":"ಹೋಸ್ಟ್ ಗಳಿಕೆಗಳು", "Host earnings & withdrawals":"ಹೋಸ್ಟ್ ಗಳಿಕೆಗಳು ಮತ್ತು ಹಿಂಪಡೆಯುವಿಕೆಗಳು", "View available earnings and request a withdrawal.":"ಲಭ್ಯ ಗಳಿಕೆಗಳನ್ನು ನೋಡಿ ಹಿಂಪಡೆಯಲು ವಿನಂತಿಸಿ.", "Become a Host":"ಹೋಸ್ಟ್ ಆಗಿ", "Withdrawal requests":"ಹಿಂಪಡೆಯುವಿಕೆ ವಿನಂತಿಗಳು", "No requests yet":"ಇನ್ನೂ ವಿನಂತಿಗಳಿಲ್ಲ", "Withdraw your earnings":"ನಿಮ್ಮ ಗಳಿಕೆಯನ್ನು ಹಿಂಪಡೆಯಿರಿ", "Bank account":"ಬ್ಯಾಂಕ್ ಖಾತೆ", "UPI ID":"UPI ID", "Verified":"ಪರಿಶೀಲಿಸಲಾಗಿದೆ", "In review":"ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ", "Pending":"ಬಾಕಿ", "Amount sent":"ಮೊತ್ತ ಕಳುಹಿಸಲಾಗಿದೆ", "How much would you like to withdraw?":"ನೀವು ಎಷ್ಟು ಹಿಂಪಡೆಯಲು ಬಯಸುತ್ತೀರಿ?", "Example: 500":"ಉದಾಹರಣೆ: 500", "Saving…":"ಉಳಿಸಲಾಗುತ್ತಿದೆ…", "Sending request…":"ವಿನಂತಿ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", "Enter an amount to continue":"ಮುಂದುವರಿಯಲು ಮೊತ್ತ ನಮೂದಿಸಿ" },
  ml: { "Host earnings":"ഹോസ്റ്റ് വരുമാനം", "Host earnings & withdrawals":"ഹോസ്റ്റ് വരുമാനവും പിൻവലിക്കലും", "View available earnings and request a withdrawal.":"ലഭ്യമായ വരുമാനം കാണുകയും പിൻവലിക്കൽ അഭ്യർത്ഥിക്കുകയും ചെയ്യുക.", "Become a Host":"ഹോസ്റ്റ് ആകുക", "Withdrawal requests":"പിൻവലിക്കൽ അഭ്യർത്ഥനകൾ", "No requests yet":"ഇതുവരെ അഭ്യർത്ഥനകളില്ല", "Withdraw your earnings":"നിങ്ങളുടെ വരുമാനം പിൻവലിക്കുക", "Bank account":"ബാങ്ക് അക്കൗണ്ട്", "UPI ID":"UPI ID", "Verified":"പരിശോധിച്ചു", "In review":"പരിശോധനയിൽ", "Pending":"തീർപ്പാക്കാത്തത്", "Amount sent":"തുക അയച്ചു", "How much would you like to withdraw?":"എത്ര പിൻവലിക്കാൻ ആഗ്രഹിക്കുന്നു?", "Example: 500":"ഉദാഹരണം: 500", "Saving…":"സേവ് ചെയ്യുന്നു…", "Sending request…":"അഭ്യർത്ഥന അയക്കുന്നു…", "Enter an amount to continue":"തുടരാൻ തുക നൽകുക" },
  bn: { "Host earnings":"হোস্ট আয়", "Host earnings & withdrawals":"হোস্ট আয় ও উত্তোলন", "View available earnings and request a withdrawal.":"উপলব্ধ আয় দেখুন এবং উত্তোলনের অনুরোধ করুন।", "Become a Host":"হোস্ট হন", "Withdrawal requests":"উত্তোলনের অনুরোধ", "No requests yet":"এখনও কোনো অনুরোধ নেই", "Withdraw your earnings":"আপনার আয় তুলুন", "Bank account":"ব্যাঙ্ক অ্যাকাউন্ট", "UPI ID":"UPI ID", "Verified":"যাচাইকৃত", "In review":"পর্যালোচনায়", "Pending":"অপেক্ষমাণ", "Amount sent":"টাকা পাঠানো হয়েছে", "How much would you like to withdraw?":"আপনি কত টাকা তুলতে চান?", "Example: 500":"উদাহরণ: 500", "Saving…":"সংরক্ষণ করা হচ্ছে…", "Sending request…":"অনুরোধ পাঠানো হচ্ছে…", "Enter an amount to continue":"চালিয়ে যেতে টাকা লিখুন" },
  mr: { "Host earnings":"होस्ट कमाई", "Host earnings & withdrawals":"होस्ट कमाई आणि पैसे काढणे", "View available earnings and request a withdrawal.":"उपलब्ध कमाई पहा आणि पैसे काढण्याची विनंती करा.", "Become a Host":"होस्ट बना", "Withdrawal requests":"पैसे काढण्याच्या विनंत्या", "No requests yet":"अद्याप विनंत्या नाहीत", "Withdraw your earnings":"तुमची कमाई काढा", "Bank account":"बँक खाते", "UPI ID":"UPI ID", "Verified":"सत्यापित", "In review":"पुनरावलोकनात", "Pending":"प्रलंबित", "Amount sent":"रक्कम पाठवली", "How much would you like to withdraw?":"तुम्हाला किती रक्कम काढायची आहे?", "Example: 500":"उदाहरण: 500", "Saving…":"जतन करत आहे…", "Sending request…":"विनंती पाठवत आहे…", "Enter an amount to continue":"पुढे जाण्यासाठी रक्कम भरा" },
};

Object.assign(tamil, hostPayoutTranslations.ta);
Object.assign(hindi, hostPayoutTranslations.hi);
Object.assign(telugu, hostPayoutTranslations.te);
Object.assign(kannada, hostPayoutTranslations.kn);
Object.assign(malayalam, hostPayoutTranslations.ml);
Object.assign(bengali, hostPayoutTranslations.bn);
Object.assign(marathi, hostPayoutTranslations.mr);

Object.assign(tamil, {
  "HOST DASHBOARD": "ஹோஸ்ட் டாஷ்போர்டு",
  "Hi": "வணக்கம்",
  "Welcome back": "மீண்டும் வரவேற்கிறோம்",
  "Your call activity and earnings, live from your account.": "உங்கள் கணக்கிலிருந்து நேரடி அழைப்பு செயல்பாடும் வருமானமும்.",
  "Today": "இன்று",
  "CONNECTED CALLS": "இணைந்த அழைப்புகள்",
  "EARNED TODAY": "இன்று ஈட்டியது",
  "From completed call billing": "முடிந்த அழைப்புகளின் கட்டணத்திலிருந்து",
  "All time": "மொத்தம்",
  "TOTAL CALLS": "மொத்த அழைப்புகள்",
  "TOTAL EARNINGS": "மொத்த வருமானம்",
  "Host earning rates": "ஹோஸ்ட் வருமான விகிதங்கள்",
  "DAILY TALK TIME": "தினசரி பேச்சு நேரம்",
  "AUDIO / VIDEO": "ஆடியோ / வீடியோ",
  "MISSED / DECLINED": "தவறிய / நிராகரித்த",
  "Host tools": "ஹோஸ்ட் கருவிகள்",
  "Recent activity": "சமீபத்திய செயல்பாடு",
  "View calls": "அழைப்புகளைப் பார்க்கவும்",
  "No calls yet": "இதுவரை அழைப்புகள் இல்லை",
  "Your completed and missed call activity will appear here.": "உங்கள் முடிந்த மற்றும் தவறிய அழைப்புகள் இங்கே தோன்றும்.",
  "Earnings & withdrawals": "வருமானம் மற்றும் பணம் எடுத்தல்",
  "My profile": "என் சுயவிவரம்",
  "Edit profile": "சுயவிவரத்தைத் திருத்தவும்",
  "Presence status": "இருப்பு நிலை",
  "Automatic from app activity and calls": "பயன்பாட்டு செயல்பாடு மற்றும் அழைப்புகளிலிருந்து தானாக",
  "Favorites": "பிடித்தவை",
  "Call history": "அழைப்பு வரலாறு",
  "Online": "ஆன்லைனில்",
  "Available for a conversation": "உரையாடலுக்குக் கிடைக்கிறது",
  "Unavailable": "கிடைக்கவில்லை",
  "Your conversations": "உங்கள் உரையாடல்கள்",
  "A little history. A reason to reconnect.": "சிறிய வரலாறு. மீண்டும் இணைவதற்கான காரணம்.",
  "All": "அனைத்தும்",
  "Missed": "தவறியவை",
  "Incoming": "வரும் அழைப்புகள்",
  "Outgoing": "செல்லும் அழைப்புகள்",
  "Recent calls": "சமீபத்திய அழைப்புகள்",
  "Cancelled": "ரத்து செய்யப்பட்டது",
  "Rejected": "நிராகரிக்கப்பட்டது",
  "Ended": "முடிந்தது",
  "Ringing": "அழைப்பு வருகிறது",
  "View receipt for coin details": "நாணய விவரங்களுக்கான ரசீதைப் பார்க்கவும்",
  "Chat": "அரட்டை",
  "Report": "புகாரளி",
  "Mobile number": "மொபைல் எண்",
  "Enter mobile number": "மொபைல் எண்ணை உள்ளிடவும்",
  "Talk. Laugh.\nMake a new friend.": "பேசுங்கள். சிரியுங்கள்.\nபுதிய நண்பரை உருவாக்குங்கள்.",
  "Voice call with friendly people, anytime you feel like chatting.": "உங்களுக்கு பேச வேண்டும் என்று தோன்றும் போதெல்லாம் நட்பானவர்களுடன் குரல் அழைப்பு.",
  "Log in or sign up": "உள்நுழையுங்கள் அல்லது பதிவு செய்யுங்கள்",
  "Continue with your mobile number": "உங்கள் மொபைல் எண்ணுடன் தொடரவும்",
  "Your number\nstays private": "உங்கள் எண்\nதனிப்பட்டதாக இருக்கும்",
  "Connect with\nconfidence": "நம்பிக்கையுடன்\nஇணையுங்கள்",
  "Meet new\nfriends": "புதிய\nநண்பர்களைச் சந்தியுங்கள்",
  "Made for friendly conversations. 18+ only.": "நட்பான உரையாடல்களுக்காக. 18+ வயதினருக்கு மட்டும்.",
  "Message": "செய்தி",
  "Type a message…": "செய்தியை உள்ளிடவும்…",
  "Search conversations": "உரையாடல்களைத் தேடுங்கள்",
  "Find a conversation": "ஒரு உரையாடலைக் கண்டறியவும்",
  "Name, city, or something in common": "பெயர், நகரம் அல்லது பொதுவான விருப்பம்",
  "More filters": "மேலும் வடிகட்டிகள்",
  "Messages": "செய்திகள்",
  "New chat": "புதிய உரையாடல்",
  "Your payout details are locked while our team reviews them. Withdrawals unlock after verification, and we’ll notify you once it is complete.": "எங்கள் குழு மதிப்பாய்வு செய்யும் வரை உங்கள் பணம் பெறும் விவரங்கள் பாதுகாப்பாக வைக்கப்படும். சரிபார்ப்புக்குப் பிறகு பணம் எடுக்கலாம்; முடிந்ததும் உங்களுக்குத் தெரிவிப்போம்.",
  "Once you send your request, our team will check it and send your earnings within 2–3 business days.": "நீங்கள் கோரிக்கையை அனுப்பியதும், எங்கள் குழு அதைச் சரிபார்த்து 2–3 வேலை நாட்களுக்குள் உங்கள் வருமானத்தை அனுப்பும்.",
  "Your UPI ID will be checked by our team before your first withdrawal.": "உங்கள் முதல் பணம் எடுத்தலுக்கு முன் எங்கள் குழு உங்கள் UPI ID-ஐச் சரிபார்க்கும்.",
  "Name shown on the payout destination": "பணம் பெறும் விவரங்களில் உள்ள பெயர்",
  "Enter account number": "கணக்கு எண்ணை உள்ளிடவும்",
  "Enter account number again": "கணக்கு எண்ணை மீண்டும் உள்ளிடவும்",
  "Example: HDFC0001234": "உதாரணம்: HDFC0001234",
  "Example: name@bank": "உதாரணம்: name@bank",
  "Save UPI ID": "UPI ID-ஐச் சேமிக்கவும்",
  "Save bank account": "வங்கி கணக்கைச் சேமிக்கவும்",
});

const dictionaries: Partial<Record<AppLanguage, Record<string, string>>> = {
  ta: tamil, hi: hindi, te: telugu, kn: kannada, ml: malayalam, bn: bengali, mr: marathi,
};

type LanguageContextValue = {
  language: AppLanguage;
  languageLabel: string;
  setLanguage: (language: AppLanguage) => Promise<void>;
  translate: (text: string) => string;
  usesIndicScript: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

async function readSavedLanguage(): Promise<AppLanguage> {
  try {
    const saved = Platform.OS === "web"
      ? globalThis.localStorage?.getItem(storageKey)
      : await SecureStore.getItemAsync(storageKey);
    return priorityIndianLanguages.some((item) => item.code === saved && item.available)
      ? saved as AppLanguage
      : "en";
  } catch {
    return "en";
  }
}

async function persistLanguage(language: AppLanguage) {
  if (Platform.OS === "web") globalThis.localStorage?.setItem(storageKey, language);
  else await SecureStore.setItemAsync(storageKey, language);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    void readSavedLanguage().then(setLanguageState);
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    languageLabel: priorityIndianLanguages.find((item) => item.code === language)?.label ?? "English",
    setLanguage: async (nextLanguage) => {
      setLanguageState(nextLanguage);
      await persistLanguage(nextLanguage);
    },
    translate: (text) => dictionaries[language]?.[text] ?? text,
    usesIndicScript: language !== "en",
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider.");
  return value;
}
