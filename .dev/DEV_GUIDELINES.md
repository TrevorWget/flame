## Adding new config key

1. Edit utils/init/initialConfig.json (the default value)
2. Edit validation/config.js (the allowed values; also used to validate settings in backups)
3. If guests need the value, add it to PUBLIC_KEYS in utils/sanitizeConfig.js; other keys are only sent to logged-in users
4. Edit client/src/interfaces/Config.ts
5. Edit client/src/utility/templateObjects/configTemplate.ts

If config value will be used in a form:

6. Edit client/src/interfaces/Forms.ts
7. Edit client/src/utility/templateObjects/settingsTemplate.ts
