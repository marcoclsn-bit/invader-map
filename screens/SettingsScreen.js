import { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert,
  Modal, TextInput, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { PALETTE, STATUS_LABEL, ALL_STATUSES } from '../constants';

// ─── Sélecteur de couleur (palette dans une Modal) ────────────────────────────

function ColorPickerModal({ title, value, onSelect, onClose }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.colorCard}>
          <Text style={styles.colorTitle}>{title}</Text>
          <View style={styles.palette}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.swatch, { backgroundColor: c }]}
                onPress={() => { onSelect(c); onClose(); }}
              >
                {value === c && <Text style={styles.swatchCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Formulaire étiquette (création / modification) ───────────────────────────

function LabelFormModal({ def, onSave, onClose }) {
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
      <Pressable style={styles.formOverlay} onPress={onClose}>
        <Pressable style={styles.formCard}>
          <Text style={styles.formTitle}>
            {isNew ? 'Nouvelle étiquette' : isDefault ? 'Couleur de l\'étiquette' : 'Modifier l\'étiquette'}
          </Text>

          {isDefault
            ? <Text style={styles.formDefaultName}>{def.name}</Text>
            : (
              <TextInput
                style={styles.formInput}
                value={name}
                onChangeText={setName}
                placeholder="Nom de l'étiquette"
                maxLength={30}
                autoFocus
                returnKeyType="done"
              />
            )
          }

          <Text style={styles.formLabel}>Couleur</Text>
          <View style={styles.palette}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.swatch, { backgroundColor: c }]}
                onPress={() => setColor(c)}
              >
                {color === c && <Text style={styles.swatchCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.formCancelBtn} onPress={onClose}>
              <Text style={styles.formCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formSaveBtn, (!name.trim() && !isDefault) && styles.formSaveBtnDisabled]}
              onPress={handleSave}
              disabled={!name.trim() && !isDefault}
            >
              <Text style={styles.formSaveText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Composants de mise en page ───────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// Row générique :
//   - label + hint + trailing (élément à droite) + onPress → ligne tappable standard
//   - children → contenu sous le label (contrôles inline)
//   - action → texte bleu (action principale)
//   - destructive → texte rouge
function Row({ label, hint, trailing, onPress, destructive, action, last, children }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.row, !last && styles.rowBorder]} onPress={onPress} activeOpacity={0.6}>
      {(label !== undefined || trailing) && (
        <View style={styles.rowHead}>
          <View style={styles.rowLeft}>
            {label !== undefined && (
              <Text style={[
                styles.rowLabel,
                destructive && styles.rowDestructive,
                action && styles.rowAction,
              ]}>
                {label}
              </Text>
            )}
            {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
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
  const {
    statusColors, setStatusColor,
    labelDefs, addLabel, updateLabel, deleteLabel,
    mapsApp, setMapsAppPref,
    resetLabels,
  } = useAppContext();

  // colorPickerFor : null | 'ok' | 'damaged' | 'destroyed' | 'unknown'
  const [colorPickerFor, setColorPickerFor] = useState(null);
  // labelForm : undefined (fermé) | null (créer) | def object (modifier)
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
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>Réglages</Text>

      {/* ── Couleurs des statuts ── */}
      <Section title="Couleurs des statuts">
        {ALL_STATUSES.map((status, i) => (
          <Row
            key={status}
            label={STATUS_LABEL[status]}
            trailing={<View style={[styles.colorDot, { backgroundColor: statusColors[status] }]} />}
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
        {labelDefs.map((def, i) => (
          <Row key={def.id} last={false}>
            <View style={styles.labelRow}>
              <View style={[styles.colorDot, { backgroundColor: def.color }]} />
              <Text style={styles.labelName} numberOfLines={1}>{def.name}</Text>
              {def.isDefault && <Text style={styles.defaultBadge}>par défaut</Text>}
              <TouchableOpacity onPress={() => setLabelForm(def)} style={styles.labelActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.labelActionIcon}>✎</Text>
              </TouchableOpacity>
              {!def.isDefault && (
                <TouchableOpacity onPress={() => confirmDelete(def)} style={styles.labelActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.labelActionIcon, { color: '#FF3B30' }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </Row>
        ))}
        <Row label="+ Créer une étiquette" onPress={() => setLabelForm(null)} action last />
      </Section>

      {/* ── Navigation ── */}
      <Section title="Navigation">
        <Row
          label="App de cartes par défaut"
          hint={mapsApp === null ? 'Sera demandé au premier « Y aller »' : undefined}
          last
        >
          <View style={styles.segmented}>
            {[
              { key: 'apple', label: 'Plans' },
              { key: 'google', label: 'Google Maps' },
            ].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.seg, mapsApp === key && styles.segActive]}
                onPress={() => setMapsAppPref(key)}
              >
                <Text style={[styles.segText, mapsApp === key && styles.segTextActive]}>{label}</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },

  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    paddingHorizontal: 20,
    marginBottom: 24,
  },

  // Sections
  section: { marginBottom: 28, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },

  // Rows
  row: { paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 16, color: '#1C1C1E' },
  rowDestructive: { color: '#FF3B30' },
  rowAction: { color: '#007AFF' },
  rowHint: { fontSize: 13, color: '#8E8E93', marginTop: 3 },

  // Dot de couleur (statuts + étiquettes)
  colorDot: { width: 24, height: 24, borderRadius: 12 },

  // Étiquettes list
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelName: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  defaultBadge: { fontSize: 12, color: '#8E8E93', fontStyle: 'italic' },
  labelActionBtn: { padding: 2 },
  labelActionIcon: { fontSize: 16, color: '#8E8E93' },

  // Segmented (App de cartes)
  segmented: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seg: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#F2F2F7' },
  segActive: { backgroundColor: '#1C1C1E' },
  segText: { fontSize: 14, fontWeight: '500', color: '#636366' },
  segTextActive: { color: '#fff' },

  // ColorPickerModal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  colorCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  colorTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E', marginBottom: 16 },

  // LabelFormModal
  formOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  formCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 16 },
  formDefaultName: { fontSize: 16, color: '#1C1C1E', marginBottom: 16 },
  formInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    color: '#1C1C1E',
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  formCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  formCancelText: { fontSize: 16, fontWeight: '500', color: '#636366' },
  formSaveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  formSaveBtnDisabled: { opacity: 0.4 },
  formSaveText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Palette partagée
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
