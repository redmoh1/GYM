import { SvgIcon, type SvgIconProps } from '@mui/material';

export function DeleteMemberIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 512 512" {...props}>
      <circle cx="196" cy="157" r="84" fill="#ff0000" />
      <path
        d="M45 366c0-67 54-121 121-121h58c33 0 63 13 85 34a125 125 0 0 0-39 87c0 24 7 46 19 65H77c-18 0-32-14-32-32z"
        fill="#ff0000"
      />
      <circle cx="379" cy="366" r="101" fill="#ff0000" />
      <rect x="327" y="355" width="104" height="22" rx="11" fill="#111111" />
    </SvgIcon>
  );
}
