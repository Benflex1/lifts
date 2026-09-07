import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useStorage } from '../context/StorageContext';

export function ReadOnlyBanner() {
  const { isReadOnly, takeOverLease } = useStorage();
  const [loading, setLoading] = useState(false);

  if (!isReadOnly) {
    return null;
  }

  const handleTakeOver = async () => {
    setLoading(true);
    try {
      await takeOverLease();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.banner}>
      <View style={styles.content}>
        <AlertCircle size={18} color="#F59E0B" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Read-Only Mode</Text>
          <Text style={styles.description}>
            Another tab is using the database. Changes will not save here until you take over.
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={handleTakeOver}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#000000" />
        ) : (
          <Text style={styles.actionText}>Take Over</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#78350F',
    borderBottomWidth: 1,
    borderBottomColor: '#B45309',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    color: '#FEF3C7',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  actionButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'center',
  },
  actionText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
});
