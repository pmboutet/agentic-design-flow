# Date Pickers - Exemples pratiques

## 📚 Exemples d'utilisation

Ce document contient des exemples pratiques et des patterns courants pour utiliser les composants de date picker.

## 1. Utilisation basique

### DatePicker simple
```tsx
import { useState } from 'react';
import { DatePicker } from '@/components/ui/date-pickers';

export function BasicDateExample() {
  const [birthDate, setBirthDate] = useState<string>("");
  
  return (
    <div>
      <label>Date de naissance</label>
      <DatePicker
        value={birthDate}
        onChange={setBirthDate}
        placeholder="Sélectionnez votre date de naissance"
        maxDate={new Date()} // Pas de dates futures
      />
    </div>
  );
}
```

### DateTimePicker avec heure
```tsx
import { useState } from 'react';
import { DateTimePicker } from '@/components/ui/date-pickers';

export function MeetingScheduler() {
  const [meetingTime, setMeetingTime] = useState<string>("");
  
  return (
    <div>
      <label>Heure de réunion</label>
      <DateTimePicker
        value={meetingTime}
        onChange={setMeetingTime}
        placeholder="Planifier la réunion"
        minDate={new Date()} // Seulement dates futures
      />
    </div>
  );
}
```

### DateRangePicker pour période
```tsx
import { useState } from 'react';
import { DateRangePicker, type DateRange } from '@/components/ui/date-pickers';

export function VacationPicker() {
  const [vacation, setVacation] = useState<DateRange | null>(null);
  
  return (
    <div>
      <label>Période de vacances</label>
      <DateRangePicker
        value={vacation}
        onChange={setVacation}
        placeholder="Sélectionner vos dates de vacances"
      />
      
      {vacation && (
        <p>
          Du {new Date(vacation.start).toLocaleDateString()}
          au {new Date(vacation.end).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
```

## 2. Avec React Hook Form

### Formulaire simple
```tsx
import { useForm, Controller } from 'react-hook-form';
import { DateTimePicker } from '@/components/ui/date-pickers';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  eventName: z.string().min(1, "Le nom est requis"),
  eventDate: z.string().min(1, "La date est requise"),
});

type FormData = z.infer<typeof schema>;

export function EventForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      eventName: "",
      eventDate: "",
    }
  });
  
  const onSubmit = (data: FormData) => {
    console.log('Event:', data);
  };
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label>Nom de l'événement</label>
        <input {...form.register("eventName")} />
        {form.formState.errors.eventName && (
          <p className="error">{form.formState.errors.eventName.message}</p>
        )}
      </div>
      
      <div>
        <label>Date de l'événement</label>
        <Controller
          control={form.control}
          name="eventDate"
          render={({ field }) => (
            <DateTimePicker
              value={field.value}
              onChange={field.onChange}
              placeholder="Quand aura lieu l'événement ?"
            />
          )}
        />
        {form.formState.errors.eventDate && (
          <p className="error">{form.formState.errors.eventDate.message}</p>
        )}
      </div>
      
      <button type="submit">Créer l'événement</button>
    </form>
  );
}
```

### Formulaire avec plage de dates
```tsx
import { useForm } from 'react-hook-form';
import { DateRangePicker, type DateRange } from '@/components/ui/date-pickers';

type ProjectFormData = {
  projectName: string;
  dateRange: DateRange | null;
};

export function ProjectForm() {
  const form = useForm<ProjectFormData>({
    defaultValues: {
      projectName: "",
      dateRange: null,
    }
  });
  
  const onSubmit = (data: ProjectFormData) => {
    if (data.dateRange) {
      console.log('Project from', data.dateRange.start, 'to', data.dateRange.end);
    }
  };
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label>Nom du projet</label>
        <input {...form.register("projectName")} />
      </div>
      
      <div>
        <label>Période du projet</label>
        <DateRangePicker
          value={form.watch("dateRange")}
          onChange={(value) => form.setValue("dateRange", value)}
          placeholder="Sélectionner la période"
        />
      </div>
      
      <button type="submit">Créer le projet</button>
    </form>
  );
}
```

## 3. Patterns avancés

### Dates conditionnelles
```tsx
import { useState } from 'react';
import { DatePicker } from '@/components/ui/date-pickers';

export function ConditionalDates() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // La date de fin doit être après la date de début
  const minEndDate = startDate ? new Date(startDate) : undefined;
  
  return (
    <div>
      <div>
        <label>Date de début</label>
        <DatePicker
          value={startDate}
          onChange={setStartDate}
          placeholder="Date de début"
        />
      </div>
      
      <div>
        <label>Date de fin</label>
        <DatePicker
          value={endDate}
          onChange={setEndDate}
          placeholder="Date de fin"
          minDate={minEndDate}
          disabled={!startDate} // Désactivé tant qu'aucune date de début
        />
      </div>
    </div>
  );
}
```

### Avec validation custom
```tsx
import { useState } from 'react';
import { DateTimePicker } from '@/components/ui/date-pickers';

export function ValidatedDatePicker() {
  const [date, setDate] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  const handleDateChange = (value: string) => {
    setDate(value);
    
    if (!value) {
      setError("La date est requise");
      return;
    }
    
    const selectedDate = new Date(value);
    const now = new Date();
    
    // Vérifier que c'est au moins 24h dans le futur
    const minTime = now.getTime() + (24 * 60 * 60 * 1000);
    
    if (selectedDate.getTime() < minTime) {
      setError("La date doit être au moins 24h dans le futur");
    } else {
      setError("");
    }
  };
  
  return (
    <div>
      <label>Date de livraison</label>
      <DateTimePicker
        value={date}
        onChange={handleDateChange}
        placeholder="Sélectionner la date de livraison"
        className={error ? "border-red-500" : ""}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
```

### Avec état de chargement
```tsx
import { useState } from 'react';
import { DatePicker } from '@/components/ui/date-pickers';

export function DatePickerWithLoading() {
  const [date, setDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({ date })
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div>
      <DatePicker
        value={date}
        onChange={setDate}
        disabled={isSubmitting}
        placeholder="Choisir une date"
      />
      
      <button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement...' : 'Confirmer'}
      </button>
    </div>
  );
}
```

## 4. Styling personnalisé

### Avec classes custom
```tsx
import { DatePicker } from '@/components/ui/date-pickers';

export function StyledDatePicker() {
  return (
    <DatePicker
      value={date}
      onChange={setDate}
      className="w-full max-w-md border-2 border-purple-500 hover:border-purple-400"
    />
  );
}
```

### Avec wrapper
```tsx
import { DateTimePicker } from '@/components/ui/date-pickers';

export function WrappedDatePicker() {
  return (
    <div className="relative">
      <div className="absolute -top-2 left-2 bg-white px-2 text-xs text-gray-600">
        Date limite
      </div>
      <DateTimePicker
        value={date}
        onChange={setDate}
        className="border-gray-300"
      />
    </div>
  );
}
```

## 5. Accessibilité

### Avec labels appropriés
```tsx
import { DatePicker } from '@/components/ui/date-pickers';

export function AccessibleDatePicker() {
  const id = "appointment-date";
  
  return (
    <div>
      <label htmlFor={id} className="block mb-2 font-medium">
        Date du rendez-vous
        <span className="text-red-500 ml-1" aria-label="requis">*</span>
      </label>
      
      <DatePicker
        id={id}
        value={date}
        onChange={setDate}
        placeholder="Sélectionner une date"
      />
      
      <p className="text-sm text-gray-600 mt-1" id={`${id}-hint`}>
        Choisissez une date disponible pour votre rendez-vous
      </p>
    </div>
  );
}
```

## 6. Cas d'usage réels

### Formulaire de réservation
```tsx
import { useState } from 'react';
import { DateTimePicker, DateRangePicker, type DateRange } from '@/components/ui/date-pickers';

export function BookingForm() {
  const [checkIn, setCheckIn] = useState<string>("");
  const [checkOut, setCheckOut] = useState<string>("");
  const [guests, setGuests] = useState(1);
  
  const today = new Date();
  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 6); // 6 mois max
  
  return (
    <form>
      <h2>Réservation d'hôtel</h2>
      
      <div>
        <label>Check-in</label>
        <DateTimePicker
          value={checkIn}
          onChange={setCheckIn}
          placeholder="Date d'arrivée"
          minDate={today}
          maxDate={maxDate}
        />
      </div>
      
      <div>
        <label>Check-out</label>
        <DateTimePicker
          value={checkOut}
          onChange={setCheckOut}
          placeholder="Date de départ"
          minDate={checkIn ? new Date(checkIn) : today}
          maxDate={maxDate}
          disabled={!checkIn}
        />
      </div>
      
      <div>
        <label>Nombre d'invités</label>
        <input
          type="number"
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          min={1}
          max={10}
        />
      </div>
      
      <button type="submit">Réserver</button>
    </form>
  );
}
```

### Filtre de dates
```tsx
import { useState } from 'react';
import { DateRangePicker, type DateRange } from '@/components/ui/date-pickers';

export function DateFilter() {
  const [range, setRange] = useState<DateRange | null>(null);
  const [data, setData] = useState([]);
  
  const applyFilter = () => {
    if (!range) return;
    
    // Filtrer les données par plage de dates
    const filtered = data.filter(item => {
      const itemDate = new Date(item.createdAt);
      return itemDate >= new Date(range.start) && 
             itemDate <= new Date(range.end);
    });
    
    console.log('Données filtrées:', filtered);
  };
  
  return (
    <div>
      <h3>Filtrer par date</h3>
      
      <DateRangePicker
        value={range}
        onChange={setRange}
        placeholder="Sélectionner une période"
      />
      
      <button onClick={applyFilter} disabled={!range}>
        Appliquer le filtre
      </button>
      
      {range && (
        <button onClick={() => setRange(null)}>
          Réinitialiser
        </button>
      )}
    </div>
  );
}
```

## 7. Astuces et bonnes pratiques

### ✅ DO
```tsx
// ✅ Utilisez des labels clairs
<label htmlFor="date">Date de l'événement</label>
<DatePicker id="date" ... />

// ✅ Fournissez des placeholders descriptifs
<DatePicker placeholder="Sélectionner la date de début" />

// ✅ Utilisez des contraintes appropriées
<DatePicker minDate={new Date()} /> // Pas de dates passées

// ✅ Gérez les états vides
{date ? <p>Date: {date}</p> : <p>Aucune date sélectionnée</p>}
```

### ❌ DON'T
```tsx
// ❌ N'oubliez pas les labels
<DatePicker /> // Pas de label !

// ❌ Ne stockez pas les dates en string brut
const [date, setDate] = useState("2024-01-01"); // Utilisez ISO string

// ❌ Ne dupliquez pas la logique
// Utilisez les composants fournis au lieu de recréer les vôtres
```

## 8. Migration depuis input natif

### Avant (input natif)
```tsx
<input 
  type="date" 
  value={date} 
  onChange={(e) => setDate(e.target.value)}
/>
```

### Après (DatePicker)
```tsx
<DatePicker
  value={date}
  onChange={setDate}
  placeholder="Sélectionner une date"
/>
```

### Avantages du changement
1. ✅ Design cohérent sur tous les navigateurs
2. ✅ Meilleure accessibilité
3. ✅ Plus d'options de personnalisation
4. ✅ Support des contraintes avancées
5. ✅ Animations et feedback visuel

---

**Note:** Pour plus d'exemples et de documentation, consultez :
- `/docs/DATE_PICKERS_GUIDE.md` - Guide complet
- `/src/app/test-date-pickers/page.tsx` - Page de démonstration interactive

