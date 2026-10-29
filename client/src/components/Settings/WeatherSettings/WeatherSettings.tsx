import axios from 'axios';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';

import { ApiResponse, Weather, WeatherForm } from '../../../interfaces';
import { actionCreators } from '../../../store';
import { State } from '../../../store/reducers';
import { inputHandler, weatherSettingsTemplate } from '../../../utility';
import { Button, InputGroup, SettingsHeadline } from '../../UI';

// Redux
// Typescript
// UI
// Utils
export const WeatherSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { createNotification, updateConfig } = bindActionCreators(
    actionCreators,
    dispatch
  );

  // Initial state
  const [formData, setFormData] = useState<WeatherForm>(
    weatherSettingsTemplate
  );

  // The stored key is never sent to the client, so the input only holds a new key
  const [apiKey, setApiKey] = useState('');
  const [removeApiKey, setRemoveApiKey] = useState(false);

  // Get config
  useEffect(() => {
    setFormData({
      ...config,
    });
  }, [loading, config]);

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    const willHaveKey = apiKey !== '' || (config.hasWeatherKey && !removeApiKey);

    // Check for api key input
    if ((formData.lat || formData.long) && !willHaveKey) {
      createNotification({
        title: 'Warning',
        message: 'API key is missing. Weather Module will NOT work',
      });
    }

    const payload: WeatherForm = { ...formData };

    if (apiKey !== '') {
      payload.WEATHER_API_KEY = apiKey;
    } else if (removeApiKey) {
      payload.WEATHER_API_KEY = '';
    }

    // Save settings
    await updateConfig(payload);

    setApiKey('');
    setRemoveApiKey(false);

    // Update weather
    axios
      .get<ApiResponse<Weather>>('/api/weather/update')
      .then(() => {
        createNotification({
          title: 'Success',
          message: 'Weather updated',
        });
      })
      .catch((err) => {
        createNotification({
          title: 'Error',
          message: err.response.data.error,
        });
      });
  };

  // Input handler
  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<WeatherForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  // Get user location
  const getLocation = () => {
    window.navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setFormData({
          ...formData,
          lat: latitude,
          long: longitude,
        });
      }
    );
  };

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      <SettingsHeadline text="API" />
      {/* API KEY */}
      <InputGroup>
        <label htmlFor="WEATHER_API_KEY">API key</label>
        <input
          type="text"
          id="WEATHER_API_KEY"
          name="WEATHER_API_KEY"
          placeholder={
            config.hasWeatherKey && !removeApiKey
              ? 'Saved key hidden - leave blank to keep it'
              : 'secret'
          }
          autoComplete="off"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setRemoveApiKey(false);
          }}
        />
        <span>
          Using
          <a href="https://www.weatherapi.com/pricing.aspx" target="blank">
            {' '}
            Weather API
          </a>
          . Key is required for weather module to work.
        </span>
        {config.hasWeatherKey && !removeApiKey && (
          <span
            onClick={() => {
              setApiKey('');
              setRemoveApiKey(true);
            }}
          >
            <a href="#">Remove saved key</a>
          </span>
        )}
        {removeApiKey && (
          <span>Saved key will be removed when you save changes.</span>
        )}
      </InputGroup>

      <SettingsHeadline text="Location" />
      {/* LAT */}
      <InputGroup>
        <label htmlFor="lat">Latitude</label>
        <input
          type="number"
          id="lat"
          name="lat"
          placeholder="52.22"
          value={formData.lat}
          onChange={(e) => inputChangeHandler(e, { isNumber: true })}
          step="any"
          lang="en-150"
        />
        <span onClick={getLocation}>
          <a href="#">Click to get current location</a>
        </span>
      </InputGroup>

      {/* LONG */}
      <InputGroup>
        <label htmlFor="long">Longitude</label>
        <input
          type="number"
          id="long"
          name="long"
          placeholder="21.01"
          value={formData.long}
          onChange={(e) => inputChangeHandler(e, { isNumber: true })}
          step="any"
          lang="en-150"
        />
      </InputGroup>

      <SettingsHeadline text="Other" />
      {/* TEMPERATURE */}
      <InputGroup>
        <label htmlFor="isCelsius">Temperature unit</label>
        <select
          id="isCelsius"
          name="isCelsius"
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
          value={formData.isCelsius ? 1 : 0}
        >
          <option value={1}>Celsius</option>
          <option value={0}>Fahrenheit</option>
        </select>
      </InputGroup>

      {/* WEATHER DATA */}
      <InputGroup>
        <label htmlFor="weatherData">Additional weather data</label>
        <select
          id="weatherData"
          name="weatherData"
          value={formData.weatherData}
          onChange={(e) => inputChangeHandler(e)}
        >
          <option value="cloud">Cloud coverage</option>
          <option value="humidity">Humidity</option>
        </select>
      </InputGroup>

      <Button>Save changes</Button>
    </form>
  );
};
