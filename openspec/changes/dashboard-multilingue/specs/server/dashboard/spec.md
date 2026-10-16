## ADDED Requirements

### Requirement: Lingua della dashboard
La dashboard MUST essere disponibile in italiano e in inglese. L'interfaccia (etichette, pulsanti,
dialoghi, messaggi, date ed età relative) MUST seguire la lingua scelta, e l'attributo `lang` della
pagina MUST corrispondere. I dati degli utenti (nomi, note, idee, resoconti, file dei change) MUST
restare nella lingua in cui sono scritti. Una chiave senza traduzione MUST ricadere sull'italiano.

#### Scenario: Prima visita con browser in inglese
- **WHEN** si apre la dashboard senza una scelta salvata e il browser preferisce l'inglese
- **THEN** l'interfaccia è in inglese e `<html lang>` vale `en`

#### Scenario: Prima visita con altra lingua
- **WHEN** si apre la dashboard senza una scelta salvata e il browser preferisce il francese
- **THEN** l'interfaccia è in italiano

#### Scenario: Cambio lingua
- **WHEN** l'utente sceglie "English" dal selettore
- **THEN** l'interfaccia passa all'inglese subito, senza ricaricare, e dopo un ricaricamento resta in inglese

#### Scenario: Dati non tradotti
- **WHEN** la dashboard è in inglese e un cantiere ha un resoconto scritto in italiano
- **THEN** il resoconto compare com'è, in italiano

#### Scenario: Date ed età
- **WHEN** la dashboard è in inglese e un turno è di ieri
- **THEN** compare "yesterday" e non "ieri"; un'età di tre ore compare "3 h ago"
