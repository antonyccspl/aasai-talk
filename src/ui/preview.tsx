import React, { useState } from "react";
import {
  Button,
  Card,
  Field,
  go,
  Notice,
  Section,
  Setting,
  Shell,
  T,
} from "./components";
import { useDemo } from "./store";
import { screenGroups } from "./registry";
export function Preview() {
  const d = useDemo();
  const [search, setSearch] = useState("");
  return (
    <Shell title="Screen library">
      <T size={28} bold>
        Every conversation starts somewhere.
      </T>
      <Notice>
        Explore all mobile and admin screen groups. This is an interactive UI
        preview with in-memory sample data. Reload resets it. Authentication,
        calls, media uploads and Razorpay are not connected.
      </Notice>
      <Setting
        title="Paid-call UI"
        detail="Show wallet, recharge and sample call rates"
        value={d.paid}
        onToggle={d.setPaid}
        icon="credit-card"
      />
      <Setting
        title="Later rating variant"
        value={d.later}
        onToggle={d.setLater}
        icon="star"
      />
      {d.active && (
        <Button
          title="End ongoing demo call"
          variant="danger"
          onPress={() => d.finishCall()}
        />
      )}
      <Field
        label="Find a screen"
        value={search}
        onChange={setSearch}
        placeholder="Search by name or M/A number"
      />
      {screenGroups.map(([title, items]) => {
        const found = items.filter(([name]) =>
          name.toLowerCase().includes(search.toLowerCase()),
        );
        return found.length ? (
          <Card key={title}>
            <Section title={title} />
            {found.map(([name, path]) => (
              <Setting key={name} title={name} onPress={() => go(path)} />
            ))}
          </Card>
        ) : null;
      })}
    </Shell>
  );
}
