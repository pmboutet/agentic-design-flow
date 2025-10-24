# Date Pickers Guide

## Vue d'ensemble

L'application dispose maintenant d'une suite complète de composants de sélection de date modernes, accessibles et cohérents. Tous les composants sont construits sur **React Aria Components** (Adobe), garantissant une accessibilité de premier ordre.

## Composants disponibles

### 1. DatePicker - Sélection de date simple

Pour sélectionner uniquement une date (sans heure).

```tsx
import { DatePicker } from '@/components/ui/date-pickers';

function MyComponent() {
  const [date, setDate] = useState<string>("");
  
  return (
    <DatePicker
      value={date}
      onChange={setDate}
      placeholder="Sélectionner une date"
      minDate={new Date()}
      maxDate={new Date(2025, 11, 31)}
    />
  );
}
```

**Props:**
- `value`: `string` - Date au format ISO
- `onChange`: `(value: string) => void` - Callback de changement
- `placeholder`: `string` - Texte placeholder
- `disabled`: `boolean` - Désactiver le picker
- `minDate`: `Date` - Date minimum sélectionnable
- `maxDate`: `Date` - Date maximum sélectionnable
- `className`: `string` - Classes CSS additionnelles
- `align`: `"start" | "center" | "end"` - Alignement du popover

### 2. DateTimePicker - Sélection de date et heure

Pour sélectionner une date ET une heure.

```tsx
import { DateTimePicker } from '@/components/ui/date-pickers';

function MyComponent() {
  const [datetime, setDatetime] = useState<string>("");
  
  return (
    <DateTimePicker
      value={datetime}
      onChange={setDatetime}
      placeholder="Sélectionner date et heure"
    />
  );
}
```

**Props:**
- Mêmes props que `DatePicker`
- La sélection d'heure est intégrée directement dans le popover

### 3. DateRangePicker - Sélection de plage de dates

Pour sélectionner une période (date de début et date de fin).

```tsx
import { DateRangePicker, type DateRange } from '@/components/ui/date-pickers';

function MyComponent() {
  const [range, setRange] = useState<DateRange | null>(null);
  
  return (
    <DateRangePicker
      value={range}
      onChange={setRange}
      placeholder="Sélectionner une période"
    />
  );
}
```

**Type DateRange:**
```tsx
interface DateRange {
  start: string; // ISO date string
  end: string;   // ISO date string
}
```

### 4. Calendar - Composant calendrier autonome

Composant calendrier qui peut être utilisé indépendamment.

```tsx
import { Calendar } from '@/components/ui/date-pickers';

function MyComponent() {
  const [date, setDate] = useState<Date | null>(null);
  
  return (
    <Calendar
      selected={date}
      onSelect={setDate}
      minDate={new Date()}
    />
  );
}
```

## Utilisation avec React Hook Form

Tous les composants sont compatibles avec React Hook Form via le `Controller`.

```tsx
import { Controller, useForm } from "react-hook-form";
import { DateTimePicker } from "@/components/ui/date-pickers";

function MyForm() {
  const form = useForm({
    defaultValues: {
      startDate: "",
      endDate: ""
    }
  });
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Controller
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <DateTimePicker
            value={field.value}
            onChange={field.onChange}
            placeholder="Date de début"
          />
        )}
      />
    </form>
  );
}
```

## Caractéristiques principales

### ✅ Accessibilité (A11y)
- Navigation au clavier complète
- Support des lecteurs d'écran
- Focus management
- ARIA labels appropriés
- Basé sur React Aria Components (Adobe)

### 🎨 Design moderne
- Animations fluides et naturelles
- Effets de hover/focus
- Dégradés et ombres subtiles
- Design cohérent avec l'application
- Mode sombre optimisé

### 🔒 Type Safety
- Types TypeScript complets
- Validation des props
- Intellisense dans l'IDE

### 🌍 Internationalisation
- Format de date localisé automatiquement
- Support des fuseaux horaires
- Utilise Intl.DateTimeFormat

## Test et démonstration

Une page de démonstration est disponible pour tester tous les composants :

```
http://localhost:3000/test-date-pickers
```

Cette page montre :
- Tous les types de date pickers
- Utilisation avec contraintes (min/max dates)
- Affichage des valeurs sélectionnées
- Exemples de code

## Migration depuis les anciennes implémentations

Si vous avez des `<input type="date">` dans votre code, remplacez-les par les nouveaux composants :

**Avant :**
```tsx
<input type="date" value={date} onChange={e => setDate(e.target.value)} />
```

**Après :**
```tsx
<DatePicker value={date} onChange={setDate} />
```

## Dépendances

Les composants utilisent les bibliothèques suivantes (déjà installées) :

- `react-aria-components` - Composants accessibles
- `@internationalized/date` - Gestion des dates internationalisées
- `date-fns` - Formatage des dates
- `@radix-ui/react-popover` - Popover UI
- `lucide-react` - Icônes

## Problèmes connus et solutions

### Le calendrier ne s'affiche pas correctement
Vérifiez que les classes Tailwind sont bien configurées et que le fichier `tailwind.config.js` inclut les composants UI.

### Les dates sont décalées d'un jour
Les composants gèrent automatiquement les fuseaux horaires. Assurez-vous d'utiliser les valeurs ISO string fournies.

### Le popover est coupé par le conteneur parent
Utilisez la prop `sideOffset` pour ajuster le positionnement, ou assurez-vous que le conteneur parent a `overflow: visible`.

## Support et contribution

Pour toute question ou amélioration, consultez :
- Le code source dans `/src/components/ui/`
- Les exemples dans `/src/app/test-date-pickers/`
- La documentation React Aria : https://react-spectrum.adobe.com/react-aria/

## Roadmap

Améliorations futures possibles :
- [ ] Support des presets de plages (Aujourd'hui, Cette semaine, Ce mois, etc.)
- [ ] Mode inline (calendrier toujours visible)
- [ ] Support des plages de dates multiples
- [ ] Thème personnalisable
- [ ] Sélection de l'année/mois rapide

