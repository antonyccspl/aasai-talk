import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  Badge,
  Button,
  Card,
  Chips,
  CoinStack,
  Empty,
  Field,
  go,
  Icon,
  Notice,
  Row,
  Section,
  Setting,
  Shell,
  T,
} from "./components";
import { coins, money, useDemo } from "./store";
import { CoinPack, fetchCoinPacks } from "../data/coin-packs";
import { useAuth } from "../data/auth";
import { fetchPhoneWalletActivity, PhoneWalletActivity } from "../data/wallet";
import { colors as c } from "./theme";

type WalletTransaction = {
  id: string;
  title: string;
  amount: number;
  date: string;
  kind: "Recharges" | "Calls";
  status: string;
};

function toWalletTransaction(item: PhoneWalletActivity): WalletTransaction {
  const timestamp = new Date(item.created_at);
  return {
    id: item.id,
    title: item.title,
    amount: item.coin_delta,
    date: Number.isNaN(timestamp.getTime())
      ? "Date unavailable"
      : new Intl.DateTimeFormat("en-IN", {
        day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
      }).format(timestamp),
    kind: item.category,
    status: item.status,
  };
}

function TransactionItem({ item }: { item: WalletTransaction }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => go(`/wallet/transactions/${item.id}`)}
      style={{ backgroundColor: c.low, padding: 14, borderRadius: 18 }}
    >
      <Row>
        <Icon
          name={item.amount > 0 ? "arrow-down" : "phone"}
          color={item.amount > 0 ? c.mint : c.secondary}
        />
        <View style={{ flex: 1 }}>
          <T bold size={14}>
            {item.title}
          </T>
          <T size={11} color={c.muted}>
            {item.date}
          </T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <T bold color={item.amount > 0 ? c.mint : c.secondary}>
            {item.amount > 0 ? "+" : "−"}
            {coins(Math.abs(item.amount))}
          </T>
          <T mono size={10} color={c.muted}>
            {item.status}
          </T>
        </View>
      </Row>
    </Pressable>
  );
}
export function Wallet({
  mode = "wallet",
  id,
}: {
  mode?: string;
  id?: string;
}) {
  const d = useDemo();
  const { demoPhone, user } = useAuth();
  const [coinPacks, setCoinPacks] = useState<CoinPack[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [activity, setActivity] = useState<WalletTransaction[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setCatalogLoading(true);
    setCatalogError("");
    fetchCoinPacks(controller.signal)
      .then(rows => { if (active) setCoinPacks(rows); })
      .catch((error: unknown) => {
        if (active) setCatalogError(controller.signal.aborted
          ? "Connection timed out. Check your internet connection and try again."
          : error instanceof Error ? error.message : "Unable to load coin packs. Please try again.");
      })
      .finally(() => { clearTimeout(timeout); if (active) setCatalogLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [reload, mode]);
  const refreshWallet = useCallback(() => {
    setReload(value => value + 1);
  }, []);
  useEffect(() => {
    const phone = demoPhone || user?.phone;
    let active = true;
    setActivityLoading(true);
    setActivityError("");
    if (!phone) {
      setActivity([]);
      setActivityLoading(false);
      return () => { active = false; };
    }
    void Promise.all([d.refreshWalletBalance(), fetchPhoneWalletActivity(phone)])
      .then(([, rows]) => {
        if (active) setActivity(rows.map(toWalletTransaction));
      })
      .catch((loadError: unknown) => {
        if (active) setActivityError(loadError instanceof Error
          ? loadError.message : "Unable to load wallet activity. Please try again.");
      })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [d.refreshWalletBalance, demoPhone, reload, user?.phone]);
  const selectedPack = coinPacks.find(pack => pack.coins === d.pack);
  const packPrice = selectedPack ? money(selectedPack.price_paise / 100) : "Price unavailable";
  const [filter, setFilter] = useState("All");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const isApprovedHost = d.hostStatus === "approved";
  if (isApprovedHost)
    return (
      <Shell title="Wallet">
        <Empty
          icon="shield"
          title="Wallet unavailable for Hosts"
          message="Host accounts do not purchase coins. Host earnings and withdrawals are available from the Host workspace."
          action="Open Host status"
          onPress={() => go("/host/status")}
        />
      </Shell>
    );
  if (!d.paid)
    return (
      <Shell title="Wallet">
        <Empty
          icon="credit-card"
          title="Paid calls are disabled"
          message="Paid calls are currently unavailable."
        />
      </Shell>
    );
  if (mode === "transactions" && id) {
    const tx = activity.find((x) => x.id === id);
    return (
      <Shell title="Transaction details" refreshing={activityLoading} onRefresh={refreshWallet}>
        {tx ? (
          <>
            <Badge text={tx.status} />
            <T size={32} bold>
              {tx.amount > 0 ? "+" : "−"}
              {coins(Math.abs(tx.amount))}
            </T>
            <Card>
              <T size={20} bold>
                {tx.title}
              </T>
              <Setting title="Date" detail={tx.date} icon="calendar" />
              <Setting title="Type" detail={tx.kind} icon="file-text" />
            </Card>
            <Notice>
              Receipt details are not available for this transaction.
            </Notice>
            <Button
              title="Payment help"
              variant="secondary"
              onPress={() => go("/settings/help")}
            />
          </>
        ) : (
          <Empty
            title="Transaction unavailable"
            message="This transaction could not be found."
          />
        )}
      </Shell>
    );
  }
  if (mode === "transactions")
    return (
      <Shell title="Transaction history" refreshing={activityLoading} onRefresh={refreshWallet}>
        <Chips
          items={["All", "Recharges", "Calls", "Refunds"]}
          selected={filter}
          onChange={setFilter}
        />
        {!!activityError && <Notice error>{activityError}</Notice>}
        {activity
          .filter((x) => filter === "All" || x.kind === filter)
          .map((x) => (
            <TransactionItem key={x.id} item={x} />
          ))}
        {!activityLoading && !activity.some((x) => filter === "All" || x.kind === filter) && (
          <Empty
            title="No transactions here"
            message="Activity matching this filter will appear here."
            icon="credit-card"
          />
        )}
      </Shell>
    );
  if (mode === "low-balance")
    return (
      <Shell title="Balance reminder">
        <Empty
          icon="credit-card"
          title="Make room for a longer conversation"
          message={`Minimum balance: 20 coins. Your available balance: ${coins(d.balance)}.`}
        />
        <Button title="Recharge wallet" onPress={() => go("/wallet")} />
        <Button
          title="Back to Explore"
          variant="secondary"
          onPress={() => go("/explore")}
        />
      </Shell>
    );
  if (mode === "payment")
    return (
      <Shell title="Payment status">
        <Empty
          icon="shield"
          title="Payments are not available yet"
          message="Coin purchases are not available yet."
        />
        <Button title="Back to wallet" onPress={() => go("/wallet")} />
      </Shell>
    );
  if (mode === "checkout")
    return (
      <Shell title="Razorpay checkout">
        <Empty
          icon="shield"
          title="Continue with Razorpay"
          message={`Review your ${coins(d.pack)} recharge for ${packPrice} in the secure provider checkout when the integration is connected.`}
        />
        <Notice>Checkout is disabled until a verified payment integration is available.</Notice>
        <Button title="Back to wallet" variant="secondary" onPress={() => go("/wallet")} />
      </Shell>
    );
  if (mode === "recharge")
    return (
      <Shell title="Review recharge">
        <T size={24} bold>
          More time to connect.
        </T>
        <Card>
          <T color={c.secondary}>Coin top-up</T>
          <T size={32} bold>
            {coins(d.pack)}
          </T>
          <T color={c.secondary}>{packPrice}</T>
          <Setting
            title="Current coin balance"
            detail={coins(d.balance)}
            icon="hexagon"
          />
            <Setting title="Selected pack" detail={coins(d.pack)} icon="plus" />
          <T size={12} color={c.muted}>
            Any applicable fees and taxes must be confirmed by the backend
            before live checkout.
          </T>
        </Card>
        <Notice>
          Coin purchases are temporarily unavailable. Please check back soon.
        </Notice>
        <T size={11} color={c.muted} style={{ textAlign: "center" }}>
          No payment details are collected and no coins are added.
        </T>
        <Button
          title="Change amount"
          variant="secondary"
          onPress={() => go("/wallet")}
        />
      </Shell>
    );
  return (
    <Shell tab="Wallet" refreshing={catalogLoading || activityLoading} onRefresh={refreshWallet}>
      {d.profile.gender === "Female" &&
        (d.hostStatus === "pending" || isApprovedHost) && (
          <Card>
            <Row>
              <Icon name="trending-up" color={c.mint} />
              <View style={{ flex: 1 }}>
                <T bold>Host earnings & withdrawals</T>
                <T size={12} color={c.secondary}>
                  {isApprovedHost
                    ? `₹${d.hostEarnings} available to withdraw`
                    : "Your earnings will be available after Host approval."}
                </T>
              </View>
            </Row>
            <Button
              title={
                isApprovedHost
                  ? "Withdraw earnings"
                  : "View application status"
              }
              variant="secondary"
              onPress={() =>
                go(
                  isApprovedHost
                    ? "/host/withdraw"
                    : "/host/status",
                )
              }
            />
          </Card>
        )}
      <Section title="Choose coins" />
      {catalogLoading && <T color={c.secondary}>Loading coin packs…</T>}
      {!!catalogError && (
        <>
          <Notice error>{catalogError}</Notice>
          <Button title="Try again" variant="secondary" onPress={refreshWallet} />
        </>
      )}
      {!catalogLoading && !catalogError && !coinPacks.length && (
        <T color={c.secondary}>No coin packs are available right now.</T>
      )}
      <Row
        style={{
          flexWrap: "wrap",
          justifyContent: "space-between",
          columnGap: 0,
          rowGap: 12,
        }}
      >
        {coinPacks.map(({ id, coins: amount, price_paise }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: d.pack === amount }}
            key={id}
            onPress={() => d.setPack(amount)}
            style={{
              width: "31.5%",
              padding: 12,
              minHeight: 132,
              borderRadius: 20,
              backgroundColor: d.pack === amount ? c.successSurface : c.low,
              borderWidth: 1,
              borderColor: d.pack === amount ? c.mint : "transparent",
              gap: 7,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CoinStack size={30} />
            <T size={18} bold color={d.pack === amount ? c.mint : c.text} style={{ textAlign: "center" }}>
              {amount}
            </T>
            <T mono size={11} color={c.secondary} style={{ textAlign: "center" }}>
              coins
            </T>
            <T mono size={10} color={c.muted} style={{ textAlign: "center" }}>
              {money(price_paise / 100)}
            </T>
          </Pressable>
        ))}
      </Row>
      <T mono size={11} color={c.secondary} style={{ textAlign: "center" }}>
        10 coins = 1 diamond
      </T>
      <Button
        title={`Buy ${coins(d.pack)}`}
        disabled={catalogLoading || !!catalogError || !selectedPack}
        icon="credit-card"
        onPress={() => go("/wallet/recharge")}
      />
      <T size={11} color={c.muted} style={{ textAlign: "center" }}>
        Secure checkout
      </T>
      <Field
        label="Custom coin amount"
        value={custom}
        onChange={setCustom}
        numeric
        placeholder="Enter coins"
      />
      <Button
        title="Use custom amount"
        variant="secondary"
        onPress={() => {
          const n = Number(custom);
          if (!Number.isInteger(n) || n < 1 || n > 10000)
            setError(
              "Enter a whole coin amount between 1 and 10,000.",
            );
          else {
            if (!coinPacks.some(pack => pack.coins === n)) {
              setError("Please choose one of the available coin packs.");
              return;
            }
            d.setPack(n);
            setError("");
          }
        }}
      />
      {error && <Notice error>{error}</Notice>}
      <Section
        title="Recent activity"
        action="View all"
        onPress={() => go("/wallet/transactions")}
      />
      {activityLoading && <T color={c.secondary}>Loading recent activity…</T>}
      {!!activityError && <Notice error>{activityError}</Notice>}
      {!activityLoading && !activityError && !activity.length && (
        <T color={c.secondary}>Your wallet activity will appear here.</T>
      )}
      {activity.slice(0, 3).map((x) => (
        <TransactionItem key={x.id} item={x} />
      ))}
    </Shell>
  );
}
