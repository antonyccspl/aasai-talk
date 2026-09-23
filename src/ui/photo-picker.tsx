import React, { useState } from "react";
import { Alert, Image, Linking, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Avatar, Button, Notice, Row } from "./components";

export function PhotoPicker({
  uri,
  onChange,
}: {
  uri: string;
  onChange: (uri: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(camera: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Camera permission needed",
            "Allow camera access in Settings to take your profile photo.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ],
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) onChange(result.assets[0].uri);
    } catch {
      setError(
        "Could not open the photo picker. Please try again and check photo permissions in Settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: "center" }}>
        {uri ? (
          <Image
            accessibilityLabel="Your selected profile photo"
            source={{ uri }}
            style={{ width: 112, height: 112, borderRadius: 56 }}
          />
        ) : (
          <Avatar size={112} />
        )}
      </View>
      <Row>
        <Button
          title="Take photo"
          icon="camera"
          disabled={busy}
          style={{ flex: 1 }}
          onPress={() => {
            void pick(true);
          }}
        />
        <Button
          title="From gallery"
          icon="image"
          variant="secondary"
          disabled={busy}
          style={{ flex: 1 }}
          onPress={() => {
            void pick(false);
          }}
        />
      </Row>
      {error ? <Notice error>{error}</Notice> : null}
    </View>
  );
}
