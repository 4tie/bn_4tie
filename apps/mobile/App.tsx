import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Trade = {
  id: number;
  bot_id: number | null;
  symbol: string;
  amount: number;
  price: number;
  unrealized_pnl_quote: number | null;
  realized_pnl_quote: number | null;
  status: string;
};

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }

  return response.json();
}

export default function App() {
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [botId, setBotId] = useState("");
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [quoteAmount, setQuoteAmount] = useState("100");
  const [closingTradeId, setClosingTradeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refreshTrades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [openRows, closedRows] = await Promise.all([
        requestJson("/api/trades?status=open"),
        requestJson("/api/trades?status=closed"),
      ]);
      setOpenTrades(Array.isArray(openRows) ? openRows : []);
      setClosedTrades(Array.isArray(closedRows) ? closedRows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTrades();
  }, [refreshTrades]);

  const openTradeIds = useMemo(() => openTrades.map((trade) => trade.id), [openTrades]);

  const placeBuyOrder = () => {
    const parsedAmount = Number(quoteAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Validation", "Quote amount must be greater than 0");
      return;
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol.includes("/")) {
      Alert.alert("Validation", "Symbol must look like BTC/USDT");
      return;
    }

    const parsedBotId = Number(botId);
    const payload: Record<string, unknown> = {
      symbol: normalizedSymbol,
      side: "buy",
      type: "market",
      quote_amount: parsedAmount,
    };
    if (Number.isFinite(parsedBotId) && parsedBotId > 0) {
      payload.bot_id = parsedBotId;
    }

    Alert.alert("Confirm Buy", `Buy ${normalizedSymbol} with ${parsedAmount} quote amount?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          setSubmitting(true);
          try {
            await requestJson("/api/orders", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            Alert.alert("Success", "Buy order executed");
            await refreshTrades();
          } catch (err) {
            Alert.alert("Order Failed", err instanceof Error ? err.message : "Buy failed");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const closeTrade = () => {
    const tradeId = Number(closingTradeId);
    if (!Number.isFinite(tradeId) || tradeId <= 0) {
      Alert.alert("Validation", "Provide a valid open trade id");
      return;
    }

    Alert.alert("Confirm Sell", `Close trade #${tradeId} at market?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          setSubmitting(true);
          try {
            await requestJson(`/api/trades/${tradeId}/close`, { method: "POST" });
            Alert.alert("Success", `Trade #${tradeId} closed`);
            await refreshTrades();
          } catch (err) {
            Alert.alert("Close Failed", err instanceof Error ? err.message : "Close failed");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Paper Trades</Text>
        <Text style={styles.subtitle}>API: {API_BASE}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Buy Market</Text>
          <TextInput
            style={styles.input}
            value={botId}
            onChangeText={setBotId}
            placeholder="Bot ID (optional)"
            keyboardType="numeric"
          />
          <TextInput style={styles.input} value={symbol} onChangeText={setSymbol} placeholder="BTC/USDT" />
          <TextInput
            style={styles.input}
            value={quoteAmount}
            onChangeText={setQuoteAmount}
            placeholder="Quote amount"
            keyboardType="numeric"
          />
          <Pressable style={styles.button} onPress={placeBuyOrder} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? "Submitting..." : "Buy"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sell / Close Trade</Text>
          <TextInput
            style={styles.input}
            value={closingTradeId}
            onChangeText={setClosingTradeId}
            placeholder={openTradeIds.length ? `Open IDs: ${openTradeIds.join(", ")}` : "Open trade id"}
            keyboardType="numeric"
          />
          <Pressable style={styles.button} onPress={closeTrade} disabled={submitting}>
            <Text style={styles.buttonText}>{submitting ? "Submitting..." : "Sell"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Open Trades</Text>
            <Pressable onPress={() => void refreshTrades()}>
              <Text style={styles.refresh}>Refresh</Text>
            </Pressable>
          </View>
          {loading ? <Text style={styles.muted}>Loading...</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && !error && openTrades.length === 0 ? <Text style={styles.muted}>No open trades.</Text> : null}
          {openTrades.map((trade) => (
            <View key={trade.id} style={styles.tradeRow}>
              <Text style={styles.tradeText}>#{trade.id} {trade.symbol}</Text>
              <Text style={styles.tradeSub}>qty {trade.amount.toFixed(8)} | uPnL {trade.unrealized_pnl_quote ?? "-"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Closed Trades</Text>
          {!loading && !error && closedTrades.length === 0 ? <Text style={styles.muted}>No closed trades.</Text> : null}
          {closedTrades.map((trade) => (
            <View key={trade.id} style={styles.tradeRow}>
              <Text style={styles.tradeText}>#{trade.id} {trade.symbol}</Text>
              <Text style={styles.tradeSub}>rPnL {trade.realized_pnl_quote ?? "-"}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#090b14",
  },
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    color: "#f5f7ff",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#8e95b3",
    marginBottom: 4,
  },
  card: {
    backgroundColor: "#141a2f",
    borderRadius: 12,
    borderColor: "#252d49",
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: "#f5f7ff",
    fontSize: 16,
    fontWeight: "600",
  },
  input: {
    borderColor: "#2c385b",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#f5f7ff",
    backgroundColor: "#0f1426",
  },
  button: {
    marginTop: 6,
    borderRadius: 8,
    backgroundColor: "#2f6cf6",
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refresh: {
    color: "#6fa1ff",
    fontWeight: "600",
  },
  muted: {
    color: "#9ba3c3",
  },
  error: {
    color: "#ff7a7a",
  },
  tradeRow: {
    borderTopColor: "#252d49",
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tradeText: {
    color: "#f5f7ff",
    fontWeight: "600",
  },
  tradeSub: {
    color: "#a6adca",
    marginTop: 2,
  },
});
