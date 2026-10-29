import { useState, useEffect, ChangeEvent, FormEvent } from 'react';

// Redux
import { useDispatch, useSelector } from 'react-redux';
import { State } from '../../../store/reducers';
import { bindActionCreators } from 'redux';
import { actionCreators } from '../../../store';

// Typescript
import { DockerSettingsForm } from '../../../interfaces';

// UI
import { InputGroup, Button, SettingsHeadline } from '../../UI';

// Utils
import { inputHandler, dockerSettingsTemplate } from '../../../utility';

export const DockerSettings = (): JSX.Element => {
  const { loading, config } = useSelector((state: State) => state.config);

  const dispatch = useDispatch();
  const { updateConfig } = bindActionCreators(actionCreators, dispatch);

  // Initial state
  const [formData, setFormData] = useState<DockerSettingsForm>(
    dockerSettingsTemplate
  );

  // Get config
  useEffect(() => {
    setFormData({
      ...config,
    });
  }, [loading, config]);

  // Form handler
  const formSubmitHandler = async (e: FormEvent) => {
    e.preventDefault();

    // Save settings
    await updateConfig(formData);
  };

  // Input handler
  const inputChangeHandler = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    options?: { isNumber?: boolean; isBool?: boolean }
  ) => {
    inputHandler<DockerSettingsForm>({
      e,
      options,
      setStateHandler: setFormData,
      state: formData,
    });
  };

  return (
    <form onSubmit={(e) => formSubmitHandler(e)}>
      <SettingsHeadline text="Docker" />
      {/* CUSTOM DOCKER SOCKET HOST */}
      <InputGroup>
        <label htmlFor="dockerHost">Docker host</label>
        <input
          type="text"
          id="dockerHost"
          name="dockerHost"
          placeholder="unix:///var/run/docker.sock"
          value={formData.dockerHost}
          onChange={(e) => inputChangeHandler(e)}
        />
        <span>
          unix:///path/to/docker.sock (localhost means the default socket),
          tcp://host:2375 for a socket proxy, or https://host:2376 for a TLS
          protected daemon (certificates from DOCKER_CERT_PATH). Never expose
          the Docker API without TLS outside a private network
        </span>
      </InputGroup>

      {/* USE DOCKER API */}
      <InputGroup>
        <label htmlFor="dockerApps">Use Docker API</label>
        <select
          id="dockerApps"
          name="dockerApps"
          value={formData.dockerApps ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={1}>True</option>
          <option value={0}>False</option>
        </select>
      </InputGroup>

      {/* UNPIN DOCKER APPS */}
      <InputGroup>
        <label htmlFor="unpinStoppedApps">
          Unpin stopped containers / removed ingresses
        </label>
        <select
          id="unpinStoppedApps"
          name="unpinStoppedApps"
          value={formData.unpinStoppedApps ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={1}>True</option>
          <option value={0}>False</option>
        </select>
      </InputGroup>

      {/* KUBERNETES SETTINGS */}
      <SettingsHeadline text="Kubernetes" />
      {/* USE KUBERNETES */}
      <InputGroup>
        <label htmlFor="kubernetesApps">Use Kubernetes Ingress API</label>
        <select
          id="kubernetesApps"
          name="kubernetesApps"
          value={formData.kubernetesApps ? 1 : 0}
          onChange={(e) => inputChangeHandler(e, { isBool: true })}
        >
          <option value={1}>True</option>
          <option value={0}>False</option>
        </select>
      </InputGroup>

      <Button>Save changes</Button>
    </form>
  );
};
