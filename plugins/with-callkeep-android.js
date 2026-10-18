const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

module.exports = function withCallKeepAndroid(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
    "android.permission.READ_PHONE_STATE",
    "android.permission.READ_PHONE_NUMBERS",
    "android.permission.CALL_PHONE",
  ]);
  return withAndroidManifest(config, (value) => {
    const application =
      value.modResults.manifest.application?.[0];
    if (!application)
      throw new Error("Android application entry is missing from the manifest");
    if (!Array.isArray(application.service)) application.service = [];
    const services = [
      {
        name: "io.wazo.callkeep.RNCallKeepBackgroundMessagingService",
        exported: "true",
      },
      {
        name: "io.wazo.callkeep.VoiceConnectionService",
        exported: "true",
        label: "Aasai Talk",
        permission: "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
        foregroundServiceType: "phoneCall|microphone",
        connectionService: true,
      },
    ];
    for (const item of services) {
      const existing = application.service.find(
        (service) => service.$["android:name"] === item.name,
      );
      const service = existing ?? {
        $: { "android:name": item.name },
      };
      service.$["android:exported"] = item.exported;
      if ("label" in item) service.$["android:label"] = item.label;
      if ("permission" in item) service.$["android:permission"] = item.permission;
      if ("foregroundServiceType" in item)
        service.$["android:foregroundServiceType"] = item.foregroundServiceType;
      if (item.connectionService)
        service["intent-filter"] = [
          {
            action: [
              {
                $: {
                  "android:name": "android.telecom.ConnectionService",
                },
              },
            ],
          },
        ];
      if (!existing) application.service.push(service);
    }
    return value;
  });
};
