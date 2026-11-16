import type { PolicySection } from "./platform-data";

export const policyFallbacks: Record<string, PolicySection[]> = {
  privacy: [
    {
      title: "Information you provide",
      description:
        "We use your phone number for sign-in and information you add to your profile, such as your name, username, date of birth, gender, city, languages, interests, and profile photo.",
    },
    {
      title: "Messages, calls, and safety",
      description:
        "We store messages to deliver chats and show conversation history. The Admin Portal does not provide routine browsing of private chats; authorized safety moderators can review report details and any message text you choose to include when investigating a report. One-to-one audio and video calls are live and are not recorded or stored by Aasai Talk. We retain limited call metadata needed to operate calls, manage charges, and investigate reports.",
    },
    {
      title: "Payments and Host details",
      description:
        "We keep wallet balances, purchase and usage records, payment references, and Host earnings or payout details needed to provide paid features, process withdrawals, prevent fraud, and meet accounting obligations.",
    },
    {
      title: "How we use and share information",
      description:
        "We use information to operate Aasai Talk, show profiles and conversations, process payments, provide support, enforce our rules, and protect members. Service providers help with sign-in, hosting, calls, payments, notifications, and content safety. We may also disclose information when required by law or needed to address safety, fraud, or service abuse.",
    },
    {
      title: "Online status",
      description:
        "While you use the app, we refresh a recent-activity timestamp to show your online status to authorised operations staff for service support and safety. We keep only the latest timestamp, not an activity history, and treat you as offline after about a minute without an update.",
    },
    {
      title: "Your choices and retention",
      description:
        "You can update profile details, manage notification preferences, block or report members, and request account deletion in the app. We review deletion requests; some transaction, support, and safety records may be retained when needed for legal, accounting, security, or dispute-resolution purposes.",
    },
    {
      title: "Contact us",
      description:
        "For privacy questions or requests, visit our Instagram profile: https://www.instagram.com/aasai_talk/. This policy may be updated as Aasai Talk changes; we will make the current version available in the app.",
    },
  ],
  terms: [
    {
      title: "Adults only",
      description:
        "Aasai Talk is for people aged 18 or older. By creating an account, you confirm that you meet this requirement and that the information you provide is accurate.",
    },
    {
      title: "Your account",
      description:
        "Keep your sign-in codes private and take reasonable steps to protect your account. Do not sell, share, impersonate another person, or create accounts to deceive or harm others.",
    },
    {
      title: "Using Aasai Talk",
      description:
        "Use the service lawfully and respectfully. Do not harass, threaten, exploit, defraud, spam, or pressure members, or share another person’s private information or content without permission.",
    },
    {
      title: "Content and safety checks",
      description:
        "Nudity, sexually explicit content, exploitation, and illegal or harmful content are not allowed. Profile photos may be reviewed for safety. One-to-one audio and video calls are not recorded or stored. We may review details submitted with safety reports and take action when our rules are broken.",
    },
    {
      title: "Paid features",
      description:
        "Review the displayed price and feature details before confirming a purchase. Coins are credited after payment is confirmed. Call or message usage may consume coins as shown in the app. Coins are not cash unless a specific feature or applicable law says otherwise. Refund requests are handled under the Refund and Payment Policy.",
    },
    {
      title: "Host participation",
      description:
        "Hosts must provide accurate profile and payout information, follow these terms and the Community Guidelines, and use only a payout method they are authorised to use. Withdrawal requests may be reviewed before payment.",
    },
    {
      title: "Availability and account action",
      description:
        "Features may change or be temporarily unavailable. Call quality depends on network and service conditions. We may limit, suspend, or close accounts where necessary to protect members, enforce these terms, comply with law, or address fraud or safety concerns.",
    },
    {
      title: "Contact",
      description:
        "For help with these terms, purchases, or an account decision, visit our Instagram profile: https://www.instagram.com/aasai_talk/ or use in-app support.",
    },
  ],
  community: [
    {
      title: "Treat people with respect",
      description:
        "Be kind in profiles, messages, and calls. Respect boundaries, accept a no, and do not pressure anyone to continue a conversation, call, or share personal information.",
    },
    {
      title: "No sexual or exploitative content",
      description:
        "Do not share nudity, sexually explicit content, sexual exploitation, or content involving minors. Do not request or distribute intimate content without clear consent.",
    },
    {
      title: "No harassment, hate, or threats",
      description:
        "Do not bully, stalk, intimidate, threaten, discriminate against, or repeatedly contact someone who does not want contact.",
    },
    {
      title: "Be honest and protect privacy",
      description:
        "Use your own identity and a photo you are allowed to use. Do not impersonate people, expose private details, record or share another member’s content without permission, or use someone else’s account.",
    },
    {
      title: "No scams or harmful activity",
      description:
        "Do not solicit money, deceive members, misuse payment methods, distribute malware, promote illegal activity, or use Aasai Talk to spam or manipulate others.",
    },
    {
      title: "Use safety tools and follow reviews",
      description:
        "End a call, block a member, or submit a report whenever you feel uncomfortable. We review reports and safety signals and may remove content or restrict accounts when needed to protect the community.",
    },
  ],
  safety: [
    {
      title: "Protect your information",
      description:
        "Never share sign-in codes, passwords, bank credentials, or identity documents with someone you meet through Aasai Talk. Be cautious with links and requests to move money or conversations elsewhere.",
    },
    {
      title: "Set your boundaries",
      description:
        "You can end a call, stop replying, block a member, or report a concern. You never have to continue a conversation that makes you uncomfortable.",
    },
    {
      title: "Report a concern",
      description:
        "Use the report option on a profile, chat, or call to tell us about harassment, scams, threats, impersonation, or inappropriate content. Authorized safety moderators review the details you submit. Include only relevant message text or call details; Aasai Talk does not record one-to-one audio or video calls.",
    },
    {
      title: "Need urgent help?",
      description:
        "Aasai Talk is not an emergency service. If you are in immediate danger, contact local emergency services or someone you trust.",
    },
    {
      title: "Contact support",
      description:
        "For help with a safety concern, visit our Instagram profile: https://www.instagram.com/aasai_talk/ or send a private request from the app.",
    },
  ],
  refund: [
    {
      title: "Before you purchase",
      description:
        "Review the coin amount and price shown before confirming a purchase. Coins are added after the payment provider confirms the transaction.",
    },
    {
      title: "Payment issues",
      description:
        "If a payment is successful but the related coins are missing, send a private support request from the app with your payment reference so we can investigate.",
    },
    {
      title: "Call and message usage",
      description:
        "Coins used for delivered calls or messages are reflected in your wallet activity. If you believe a charge is incorrect, contact support with the relevant transaction or call details.",
    },
    {
      title: "Refund requests",
      description:
        "Refund eligibility depends on the transaction, applicable law, and the rules of the payment provider or app store used. For help with a refund request, visit our Instagram profile: https://www.instagram.com/aasai_talk/.",
    },
  ],
};
