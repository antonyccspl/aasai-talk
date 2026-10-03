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
