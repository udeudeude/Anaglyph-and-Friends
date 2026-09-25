import type { ReactNode, SVGProps } from 'react'

export type UiIconName = 'undo' | 'redo' | 'edit' | 'download' | 'upload' | 'expand' | 'back' | 'close' | 'reset' | 'eye'

const paths: Record<UiIconName, ReactNode> = {
    undo: <><path d="M4.5 8C8.5 8 11 8 15 8C15 8 20 8 20 12.7059C20 18 15 18 15 18C11.5714 18 9.71429 18 6.28571 18"/><path d="M7.5 11.5C6.13317 10.1332 5.36683 9.36683 4 8C5.36683 6.63317 6.13317 5.86683 7.5 4.5"/></>,
    redo: <><path d="M19.5 8C15.5 8 13 8 9 8C9 8 4 8 4 12.7059C4 18 9 18 9 18C12.4286 18 14.2857 18 17.7143 18"/><path d="M16.5 11.5C17.8668 10.1332 18.6332 9.36683 20 8C18.6332 6.63317 17.8668 5.86683 16.5 4.5"/></>,
    edit: <path d="M14.3632 5.65156L15.8431 4.17157C16.6242 3.39052 17.8905 3.39052 18.6716 4.17157L20.0858 5.58579C20.8668 6.36683 20.8668 7.63316 20.0858 8.41421L18.6058 9.8942M14.3632 5.65156L4.74749 15.2672C4.41542 15.5993 4.21079 16.0376 4.16947 16.5054L3.92738 19.2459C3.87261 19.8659 4.39148 20.3848 5.0115 20.33L7.75191 20.0879C8.21972 20.0466 8.65806 19.8419 8.99013 19.5099L18.6058 9.8942M14.3632 5.65156L18.6058 9.8942"/>,
    download: <><path d="M6 20L18 20"/><path d="M12 4V16M12 16L15.5 12.5M12 16L8.5 12.5"/></>,
    upload: <><path d="M6 20L18 20"/><path d="M12 16V4M12 4L15.5 7.5M12 4L8.5 7.5"/></>,
    expand: <><path d="M9 9L4 4M4 4V8M4 4H8"/><path d="M15 9L20 4M20 4V8M20 4H16"/><path d="M9 15L4 20M4 20V16M4 20H8"/><path d="M15 15L20 20M20 20V16M20 20H16"/></>,
    back: <path d="M15 6L9 12L15 18"/>,
    close: <path d="M6.75827 17.2426L12.0009 12M17.2435 6.75736L12.0009 12M12.0009 12L6.75827 6.75736M12.0009 12L17.2435 17.2426"/>,
    reset: <><path d="M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.1006 2 19.6248 4.46819 21.1679 8"/><path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3"/></>,
    eye: <><path d="M3 13C6.6 5 17.4 5 21 13"/><path d="M12 17C10.3431 17 9 15.6569 9 14C9 12.3431 10.3431 11 12 11C13.6569 11 15 12.3431 15 14C15 15.6569 13.6569 17 12 17Z"/></>,
}

type Props = SVGProps<SVGSVGElement> & { name: UiIconName }

export default function UiIcon({ name, className = '', ...props }: Props) {
    return <svg
        aria-hidden="true"
        focusable="false"
        className={'uiIcon ' + className}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >{paths[name]}</svg>
}
