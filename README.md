# 🎭 Orar Teatru / Teatru de Revistă

Aplicație web dedicată înscrierilor și gestionării grupelor de teatru pentru elevi și părinți, cu catalog organizator în ordine alfabetică, restricții automate pe nivel de clasă și limitare de capacitate la maxim 16 elevi per grupă.

---

## 🌟 Funcționalități Principale

### 1. Formular de Înscriere pentru Elevi și Părinți
- **Câmpuri de completat**: Nume, Prenume, Clasă (Pregătitoare / 0 până la clasa a 12-a) + literă opțională, Număr de telefon părinte.
- **Cele 10 Căsuțe de Grupe & Orar**:
  - **Luni 14:00 - 15:40** — Grupa 1 (Clasele 0-6)
  - **Luni 16:20 - 18:00** — Grupa 2 (Clasele 7-12)
  - **Marți 09:50 - 11:30** — Grupa 3 (Clasele 0-12 - Program de dimineață)
  - **Marți 13:00 - 14:40** — Grupa 4 (Clasele 0-6)
  - **Marți 14:50 - 16:30** — Grupa 5 (Clasele 7-12)
  - **Miercuri 13:30 - 15:10** — Grupa 6 (Clasele 0-6)
  - **Miercuri 16:20 - 18:00** — Grupa 7 (Clasele 0-6)
  - **Joi 14:00 - 15:40** — Grupa 8 (Clasele 0-6)
  - **Joi 15:50 - 17:30** — Grupa 9 (Clasele 7-12)
  - **Vineri 09:50 - 11:30** — Grupa 10 (Clasele 0-12 - Program de dimineață)
- **Condiționare automată pe nivelul clasei**:
  - Grupele 3 și 10 acceptă toate clasele (0-12).
  - Grupele 2, 5 și 9 sunt disponibile doar pentru clasele 7-12.
  - Grupele 1, 4, 6, 7 și 8 sunt disponibile doar pentru clasele 0-6.
  - La selectarea clasei, grupele incompatibile sunt automat dezactivate și etichetate corespunzător.
- **Limită strictă de capacitate**:
  - Maxim **16 elevi** per grupă.
  - Indicator vizual al locurilor ocupate și rămase libere.
  - Când o grupă atinge 16 elevi, devine marcată ca **COMPLET** și nu mai permite înscrieri.
- **Confirmare înscriere**:
  - Părintele primește pe ecran o confirmare cu toate detaliile (nume, clasă, grupă, zi și orar) și opțiune de tipărire / salvare.

---

### 2. Panoul Profesorului / Organizatorului (Catalog)
- **Afișare în ordine alfabetică**:
  - Toți elevii înscriși sunt listați ordonați alfabetic după Nume și Prenume (cu diacritice românești).
  - Date afișate: Nume, Prenume, Clasă, Număr telefon părinte (cu link direct de apelare 📞), Grupa aleasă, Ziua & Intervalul orar, Data și ora înscrierii.
- **Căutare & Filtrare**:
  - Căutare instantanee după nume, prenume sau număr de telefon.
  - Filtrare pe o anumită grupă sau vizualizare generală.
  - Sortare la alegere (alfabetic, pe grupe, după clasă sau cele mai recente).
- **Mesaje & Anunțuri Speciale pe Grupe**:
  - Profesorul poate scrie mențiuni specifice pentru fiecare grupă (ex: *„Această grupă este destinată exclusiv elevilor de la Școala Nr. ...”*).
  - Mesajul apare imediat evidențiat într-o casetă aurie direct pe cardul acelei grupe în formularul părinților.
- **Export & Tipărire**:
  - 📥 **Descarcă Excel (CSV)**: exportă întregul tabel în format compatibil Microsoft Excel cu diacritice UTF-8.
  - 🖨️ **Tipărește Catalog**: pregătește o pagină curată A4 pentru imprimare pe hârtie sau salvare PDF.
  - ✏️ **Editare & Ștergere**: posibilitate de mutare elev în altă grupă, corectare număr sau eliminare.

---

## 🚀 Cum se pornește aplicația

### Metoda 1: Cu dublu clic pe Windows
Faceți dublu clic pe fișierul `start.bat`.

### Metoda 2: Din linia de comandă
```bash
cd "C:\Users\Laptop\.gemini\antigravity\scratch\orar-teatru"
node server.js
```

Aplicația se deschide în orice browser web la adresa:
👉 **http://localhost:3000**
