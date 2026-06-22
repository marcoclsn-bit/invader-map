import { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch, Alert,
  Modal, TextInput, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { PALETTE, STATUS_LABEL, ALL_STATUSES } from '../constants';

// ─── Sélecteur de couleur ─────────────────────────────────────────────────────

function ColorPickerModal({ title, value, onSelect, onClose }) {
  const { theme } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={layout.overlay} onPress={onClose}>
        <Pressable style={[layout.colorCard, { backgroundColor: theme.surface }]}>
          <Text style={[layout.colorTitle, { color: theme.textPrimary }]}>{title}</Text>
          <View style={layout.palette}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                style={[layout.swatch, { backgroundColor: c }]}
                onPress={() => { onSelect(c); onClose(); }}
              >
                {value === c && <Text style={layout.swatchCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Formulaire étiquette ─────────────────────────────────────────────────────

function LabelFormModal({ def, onSave, onClose }) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[5]);

  useEffect(() => {
    setName(def?.name ?? '');
    setColor(def?.color ?? PALETTE[5]);
  }, [def]);

  function handleSave() {
    const trimmed = name.trim();
    if (!def?.isDefault && !trimmed) return;
    onSave(def?.isDefault ? def.name : trimmed, color);
  }

  const isNew = def === null;
  const isDefault = def?.isDefault === true;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={layout.formOverlay} onPress={onClose}>
        <Pressable style={[layout.formCard, { backgroundColor: theme.surface }]}>
          <Text style={[layout.formTitle, { color: theme.textPrimary }]}>
            {isNew ? 'Nouvelle étiquette' : isDefault ? 'Couleur de l\'étiquette' : 'Modifier l\'étiquette'}
          </Text>

          {isDefault
            ? <Text style={[layout.formDefaultName, { color: theme.textPrimary }]}>{def.name}</Text>
            : (
              <TextInput
                style={[layout.formInput, { backgroundColor: theme.surfaceHigh, color: theme.textPrimary }]}
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={setName}
                placeholder="Nom de l'étiquette"
                maxLength={30}
                autoFocus
                returnKeyType="done"
              />
            )
          }

          <Text style={[layout.formLabel, { color: theme.textSecondary }]}>Couleur</Text>
          <View style={layout.palette}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                style={[layout.swatch, { backgroundColor: c }]}
                onPress={() => setColor(c)}
              >
                {color === c && <Text style={layout.swatchCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <View style={layout.formActions}>
            <TouchableOpacity
              style={[layout.formCancelBtn, { backgroundColor: theme.surfaceHigh }]}
              onPress={onClose}
            >
              <Text style={[layout.formCancelText, { color: theme.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[layout.formSaveBtn, { backgroundColor: theme.accent }, (!name.trim() && !isDefault) && layout.formSaveBtnDisabled]}
              onPress={handleSave}
              disabled={!name.trim() && !isDefault}
            >
              <Text style={[layout.formSaveText, { color: theme.bg }]}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Composants de mise en page ───────────────────────────────────────────────

function Section({ title, children }) {
  const { theme } = useTheme();
  return (
    <View style={layout.section}>
      <Text style={[layout.sectionTitle, { color: theme.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      <View style={[layout.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, hint, trailing, onPress, destructive, action, last, children }) {
  const { theme } = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[layout.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      {(label !== undefined || trailing) && (
        <View style={layout.rowHead}>
          <View style={layout.rowLeft}>
            {label !== undefined && (
              <Text style={[
                layout.rowLabel,
                { color: theme.textPrimary },
                destructive && { color: theme.destructive },
                action && { color: theme.link },
              ]}>
                {label}
              </Text>
            )}
            {hint ? <Text style={[layout.rowHint, { color: theme.textSecondary }]}>{hint}</Text> : null}
          </View>
          {trailing}
        </View>
      )}
      {children}
    </Wrapper>
  );
}

// ─── Écran Réglages ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark, toggle } = useTheme();
  const {
    statusColors, setStatusColor,
    labelDefs, addLabel, updateLabel, deleteLabel,
    mapsApp, setMapsAppPref,
    resetLabels,
  } = useAppContext();

  const [colorPickerFor, setColorPickerFor] = useState(null);
  const [labelForm, setLabelForm] = useState(undefined);

  function confirmReset() {
    Alert.alert(
      'Réinitialiser',
      'Les étiquettes, couleurs personnalisées et colorisation des Invaders seront remises à zéro. La progression (Invaders flashés) est préservée.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', style: 'destructive', onPress: resetLabels },
      ]
    );
  }

  function confirmDelete(def) {
    Alert.alert(
      `Supprimer « ${def.name} » ?`,
      'L\'étiquette sera retirée de tous les Invaders.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteLabel(def.id) },
      ]
    );
  }

  function handleSaveLabel(name, color) {
    if (labelForm === null) {
      addLabel(name, color);
    } else {
      updateLabel(labelForm.id, {
        ...(labelForm.isDefault ? {} : { name }),
        color,
      });
    }
    setLabelForm(undefined);
  }

  return (
    <ScrollView
      style={[layout.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[layout.screenTitle, { color: theme.textPrimary }]}>Réglages</Text>

      {/* ── Apparence ── */}
      <Section title="Apparence">
        <Row
          label="Thème sombre"
          trailing={
            <Switch
              value={isDark}
              onValueChange={toggle}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.bg}
              ios_backgroundColor={theme.border}
            />
          }
          last
        />
      </Section>

      {/* ── Couleurs des statuts ── */}
      <Section title="Couleurs des statuts">
        {ALL_STATUSES.map((status, i) => (
          <Row
            key={status}
            label={STATUS_LABEL[status]}
            trailing={<View style={[layout.colorDot, { backgroundColor: statusColors[status] }]} />}
            onPress={() => setColorPickerFor(status)}
            last={i === ALL_STATUSES.length - 1}
          />
        ))}
      </Section>

      {/* ── Mes étiquettes ── */}
      <Section title="Mes étiquettes">
        {labelDefs.length === 0 && (
          <Row label="Aucune étiquette" hint="Créez la première avec le bouton ci-dessous." />
        )}
        {labelDefs.map((def) => (
          <Row key={def.id} last={false}>
            <View style={layout.labelRow}>
              <View style={[layout.colorDot, { backgroundColor: def.color }]} />
              <Text style={[layout.labelName, { color: theme.textPrimary }]} numberOfLines={1}>{def.name}</Text>
              {def.isDefault && <Text style={[layout.defaultBadge, { color: theme.textSecondary }]}>par défaut</Text>}
              <TouchableOpacity onPress={() => setLabelForm(def)} style={layout.labelActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[layout.labelActionIcon, { color: theme.textSecondary }]}>✎</Text>
              </TouchableOpacity>
              {!def.isDefault && (
                <TouchableOpacity onPress={() => confirmDelete(def)} style={layout.labelActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[layout.labelActionIcon, { color: theme.destructive }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </Row>
        ))}
        <Row label="+ Créer une étiquette" onPress={() => setLabelForm(null)} action last />
      </Section>

      {/* ── Navigation ── */}
      <Section title="Navigation">
        <Row label="App de cartes par défaut" hint={mapsApp === null ? 'Sera demandé au premier « Y aller »' : undefined} last>
          <View style={layout.segmented}>
            {[{ key: 'apple', label: 'Plans' }, { key: 'google', label: 'Google Maps' }].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[layout.seg, { backgroundColor: mapsApp === key ? theme.accent : theme.surfaceHigh }]}
                onPress={() => setMapsAppPref(key)}
              >
                <Text style={[layout.segText, { color: mapsApp === key ? theme.bg : theme.textSecondary }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Row>
      </Section>

      {/* ── Données ── */}
      <Section title="Données">
        <Row
          label="Réinitialiser les étiquettes et couleurs"
          hint="Préserve la progression (Invaders flashés)."
          onPress={confirmReset}
          destructive
          last
        />
      </Section>

      {/* ── Modaux ── */}
      {colorPickerFor !== null && (
        <ColorPickerModal
          title={`Couleur — ${STATUS_LABEL[colorPickerFor]}`}
          value={statusColors[colorPickerFor]}
          onSelect={(color) => setStatusColor(colorPickerFor, color)}
          onClose={() => setColorPickerFor(null)}
        />
      )}
      {labelForm !== undefined && (
        <LabelFormModal
          def={labelForm}
          onSave={handleSaveLabel}
          onClose={() => setLabelForm(undefined)}
        />
      )}
    </ScrollView>
  );
}

// ─── Styles (structure uniquement — les couleurs viennent du theme) ───────────

const layout = StyleSheet.create({
  container: { flex: 1 },

  screenTitle: {
    ...typography.arcadeTitle,
    fontSize: 20,
    paddingHorizontal: 20, marginBottom: 24,
  },

  // Sections
  section: { marginBottom: 28, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.5,
    marginBottom: 8, paddingLeft: 4,
  },
  card: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },

  // Rows
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 16 },
  rowHint: { fontSize: 13, marginTop: 3 },

  // Dot de couleur
  colorDot: { width: 24, height: 24, borderRadius: 12 },

  // Étiquettes
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelName: { flex: 1, fontSize: 15 },
  defaultBadge: { fontSize: 12, fontStyle: 'italic' },
  labelActionBtn: { padding: 2 },
  labelActionIcon: { fontSize: 16 },

  // Segmented (App de cartes)
  segmented: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seg: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  segText: { fontSize: 14, fontWeight: '500' },

  // ColorPickerModal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  colorCard: { borderRadius: 16, padding: 20 },
  colorTitle: { fontSize: 17, fontWeight: '600', marginBottom: 16 },

  // LabelFormModal
  formOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  formCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  formTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  formDefaultName: { fontSize: 16, marginBottom: 16 },
  formInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  formCancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  formCancelText: { fontSize: 16, fontWeight: '500' },
  formSaveBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  formSaveBtnDisabled: { opacity: 0.4 },
  formSaveText: { fontSize: 16, fontWeight: '600' },

  // Palette partagée
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchCheck: {
    color: '#fff', fontSize: 20, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
});
