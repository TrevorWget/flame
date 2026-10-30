import { ReactNode, SyntheticEvent } from 'react';

import classes from './ModalForm.module.css';
import { Icon } from '../..';

interface ComponentProps {
  children: ReactNode;
  modalHandler?: () => void;
  formHandler: (e: SyntheticEvent<HTMLFormElement>) => void;
  // Room for side-by-side content, scrolling when taller than the screen
  wide?: boolean;
}

export const ModalForm = (props: ComponentProps): JSX.Element => {
  const _modalHandler = (): void => {
    if (props.modalHandler) {
      props.modalHandler();
    }
  };

  const modalClasses = [classes.ModalForm, props.wide && classes.Wide]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={modalClasses}>
      <div className={classes.ModalFormIcon} onClick={_modalHandler}>
        <Icon icon="mdiClose" />
      </div>
      <form onSubmit={(e) => props.formHandler(e)}>{props.children}</form>
    </div>
  );
};
