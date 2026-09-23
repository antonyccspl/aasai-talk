import React, { useEffect, useState } from "react";
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
import { coins, money, Transaction, useDemo } from "./store";
import { CoinPack, fetchCoinPacks } from "../data/coin-packs";
import { colors as c } from "./theme";
function TransactionItem({ item }: { item: Transaction }) {
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
  const [coinPacks, setCoinPacks] = useState<CoinPack[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
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
  const selectedPack = coinPacks.find(pack => pack.coins === d.pack);
  const packPrice = selectedPack ? money(selectedPack.price_paise / 100) : "Price unavailable";
  const [filter, setFilter] = useState("All");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [paymentState, setPaymentState] = useState("Pending");
  const orderKey = id || "demo";
  const credited = d.creditedOrders.includes(orderKey);
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
          message="You can enable the paid-call UI in the screen library."
          action="Screen library"
          onPress={() => go("/preview")}
        />
      </Shell>
    );
  if (mode === "transactions" && id) {
    const tx = d.transactions.find((x) => x.id === id);
    return (
      <Shell title="Transaction details">
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
              <Setting title="Reference" detail={tx.id} icon="hash" />
              <Setting title="Type" detail={tx.kind} icon="file-text" />
            </Card>
            <Notice>
              Sample ledger entry. No live Razorpay payment or receipt exists
              for this preview.
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
            message="This reference was not found in the demo ledger."
          />
        )}
      </Shell>
    );
  }
  if (mode === "transactions")
    return (
      <Shell title="Transaction history">
        <Chips
          items={["All", "Recharges", "Calls", "Refunds"]}
          selected={filter}
          onChange={setFilter}
        />
        {d.transactions
          .filter((x) => filter === "All" || x.kind === filter)
          .map((x) => (
            <TransactionItem key={x.id} item={x} />
          ))}
        {!d.transactions.some((x) => filter === "All" || x.kind === filter) && (
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
          message={`Sample minimum balance: 20 coins. Your demo balance: ${coins(d.balance)}.`}
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
        <View style={{ alignItems: "center", gap: 14, padding: 18 }}>
          <Icon
            name={
              paymentState === "Success"
                ? "check-circle"
                : paymentState === "Pending"
                  ? "clock"
                  : "alert-circle"
            }
            size={58}
            color={paymentState === "Success" ? c.mint : c.warning}
          />
          <T bold size={23}>
            {paymentState === "Pending"
              ? "Confirming your payment"
              : `Payment ${paymentState.toLowerCase()}`}
          </T>
          <T size={30} bold>
            {coins(d.pack)}
          </T>
          <T color={c.secondary}>{packPrice}</T>
          <Badge
            text={`${paymentState} · PREVIEW`}
            warning={paymentState !== "Success"}
          />
        </View>
        <Notice>
          No payment has been made. These controls preview Razorpay result
          states. Only the explicit demo-credit button changes the in-memory
          sample balance.
        </Notice>
        <Chips
          items={["Pending", "Success", "Failed", "Cancelled", "Refunded"]}
          selected={paymentState}
          onChange={setPaymentState}
        />
        {paymentState === "Success" && (
          <Button
            title={
              credited
                ? "Sample credit added once"
                : "Apply sample coin credit to demo wallet"
            }
            disabled={credited}
            onPress={() => {
              if (credited) return;
              d.setCreditedOrders((v) => [...v, orderKey]);
              d.setBalance((v) => v + d.pack);
              d.setTransactions((v) => [
                {
                  id: `DEMO-${Date.now()}`,
                  title: "Demo wallet recharge",
                  amount: d.pack,
                  date: "Just now · preview",
                  kind: "Recharges",
                  status: "Demo success",
                },
                ...v,
              ]);
            }}
          />
        )}
        {paymentState === "Pending" && (
          <Button
            title="Check status"
            variant="secondary"
            onPress={() =>
              setError(
                "Razorpay and backend verification are not connected. This order remains a preview.",
              )
            }
          />
        )}
        {error && <Notice>{error}</Notice>}
        <Button title="Back to wallet" onPress={() => go("/wallet")} />
        <Button
          title="Payment help"
          variant="secondary"
          onPress={() => go("/settings/help")}
        />
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
        <Notice>
          Checkout is not connected. This preview does not collect payment
          details or open a real order.
        </Notice>
        <Button
          title="Preview payment result"
          onPress={() => go("/wallet/payment/demo")}
        />
        <Button
          title="Cancel checkout"
          variant="secondary"
          onPress={() => go("/wallet/recharge")}
        />
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
          <Setting title="Sample credit" detail={coins(d.pack)} icon="plus" />
          <T size={12} color={c.muted}>
            Any applicable fees and taxes must be confirmed by the backend
            before live checkout.
          </T>
        </Card>
        <Button
          title="Continue with Razorpay"
          icon="arrow-right"
          disabled={catalogLoading || !!catalogError || !selectedPack}
          onPress={() => go("/wallet/checkout")}
        />
        <Button
          title="Change amount"
          variant="secondary"
          onPress={() => go("/wallet")}
        />
      </Shell>
    );
  return (
    <Shell tab="Wallet" refreshing={catalogLoading} onRefresh={() => setReload(value => value + 1)}>
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
                    : "View illustrative earnings while verification is pending."}
                </T>
              </View>
            </Row>
            <Button
              title={
                isApprovedHost
                  ? "Withdraw earnings"
                  : "View Host earnings"
              }
              variant="secondary"
              onPress={() =>
                go(
                  isApprovedHost
                    ? "/host/withdraw"
                    : "/host/withdraw-preview",
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
          <Button title="Try again" variant="secondary" onPress={() => setReload(value => value + 1)} />
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
      {d.transactions.slice(0, 3).map((x) => (
        <TransactionItem key={x.id} item={x} />
      ))}
    </Shell>
  );
}
